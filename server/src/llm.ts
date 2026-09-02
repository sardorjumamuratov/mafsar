// Server-side LLM proxy. The extension never holds an API key — generation
// and grading run here with the server's key (LLM_PROVIDER / LLM_API_KEY).
// Grounded strictly in user-supplied content; never fabricate facts.

import { randomUUID } from "node:crypto";

/**
 * An LLM-proxy failure the caller can act on: missing server config, an
 * upstream provider rejection, or an unparseable response. Distinguished from
 * unexpected bugs so the API can report *why* generation failed instead of a
 * bare 500 — the extension surfaces this text to the user.
 */
export class LLMError extends Error {
  readonly status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "LLMError";
    this.status = status;
  }
}

// --- provider adapters (same contract across providers) ----------------------

interface Req {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}
interface Provider {
  defaultModel: string;
  buildRequest(o: { apiKey: string; model: string; system: string; user: string }): Req;
  extractText(d: any): string;
  extractError(d: any, status: number): string;
}

/**
 * Output budget, and the number of study items we ask for.
 *
 * These are env-tunable because the ceiling is the provider plan, not the
 * model. Groq's free tier bills prompt + max_completion_tokens against an
 * 8000 tokens-per-minute limit, so asking for 16384 there made every request
 * fail with "Request too large" — worse than the short sets it was meant to
 * fix. The defaults stay conservative enough for that case.
 *
 * Providers that bill purely per token (OpenRouter) have no such cliff, so
 * raise both to unlock full-length sets, no code change:
 *   LLM_MAX_TOKENS=16384  LLM_MAX_ITEMS=40
 */
const MAX_OUTPUT_TOKENS = Number(process.env.LLM_MAX_TOKENS) || 4096;
const MAX_ITEMS = Number(process.env.LLM_MAX_ITEMS) || 15;

const PROVIDERS: Record<string, Provider> = {
  gemini: {
    defaultModel: "gemini-2.0-flash",
    buildRequest({ apiKey, model, system, user }) {
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: {
          system_instruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: {
            temperature: 0.4,
            responseMimeType: "application/json",
            maxOutputTokens: MAX_OUTPUT_TOKENS,
          },
        },
      };
    },
    extractText: (d) => (d?.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || "").join(""),
    extractError: (d, status) => d?.error?.message || `HTTP ${status}`,
  },
  groq: {
    // llama-3.3-70b-versatile was decommissioned 2026-08-16; Groq's stated
    // replacement. Override per-deployment with LLM_MODEL.
    defaultModel: "openai/gpt-oss-120b",
    buildRequest({ apiKey, model, system, user }) {
      return {
        url: "https://api.groq.com/openai/v1/chat/completions",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: {
          model,
          temperature: 0.4,
          max_completion_tokens: MAX_OUTPUT_TOKENS,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        },
      };
    },
    extractText: (d) => d?.choices?.[0]?.message?.content || "",
    extractError: (d, status) => d?.error?.message || `HTTP ${status}`,
  },
  openrouter: {
    // OpenRouter is OpenAI-compatible, so this mirrors the groq adapter.
    //
    // Model choice is about JSON reliability, not price. qwen3.5-flash is 25x
    // cheaper and returned a bare float ("-1.0", finish_reason "stop") on
    // every structured request we made — valid JSON, wrong type, unusable.
    // gemini-3.5-flash-lite produced correct output on every attempt at
    // ~$0.0006 a call. Override per-deployment with LLM_MODEL.
    //
    // response_format stays on regardless: several candidates prefix a
    // "Thinking Process:" monologue without it and never close the JSON.
    defaultModel: "google/gemini-3.5-flash-lite",
    buildRequest({ apiKey, model, system, user }) {
      return {
        url: "https://openrouter.ai/api/v1/chat/completions",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
          // Attribution shown on OpenRouter's dashboard; optional but free.
          "HTTP-Referer": "https://mafsar-production.up.railway.app",
          "X-Title": "Mafsar",
        },
        body: {
          model,
          temperature: 0.4,
          max_tokens: MAX_OUTPUT_TOKENS,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        },
      };
    },
    extractText: (d) => d?.choices?.[0]?.message?.content || "",
    extractError: (d, status) => d?.error?.message || `HTTP ${status}`,
  },
  anthropic: {
    defaultModel: "claude-sonnet-5",
    buildRequest({ apiKey, model, system, user }) {
      return {
        url: "https://api.anthropic.com/v1/messages",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: { model, max_tokens: MAX_OUTPUT_TOKENS, system, messages: [{ role: "user", content: user }] },
      };
    },
    extractText: (d) => (d?.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join(""),
    extractError: (d, status) => d?.error?.message || `HTTP ${status}`,
  },
};

async function callLLM(system: string, user: string): Promise<string> {
  const providerName = process.env.LLM_PROVIDER || "gemini";
  const provider = PROVIDERS[providerName] || PROVIDERS.gemini;
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new LLMError("Server LLM key not configured (set LLM_API_KEY).", 503);
  const model = process.env.LLM_MODEL || provider.defaultModel;
  const req = provider.buildRequest({ apiKey, model, system, user });
  const res = await fetch(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify(req.body),
  });
  if (!res.ok) {
    let data: any = null;
    try { data = await res.json(); } catch { /* ignore */ }
    // Name the provider and model: the usual causes are a bad key or a model
    // id the provider has since retired, and both are invisible otherwise.
    throw new LLMError(
      `${providerName} (${model}) rejected the request: ${provider.extractError(data, res.status)}`,
      502
    );
  }
  return provider.extractText(await res.json());
}

// --- prompts (ported from the extension; grounding rules preserved) ----------

const GENERATE_PROMPT = `You are a study-tool generator. You are given a learning source — it may be an
AI-chat transcript, an article, documentation, pasted notes, or a page selection. Extract the
durable, factual knowledge the user should remember and produce study material.

Rules:
- Focus on concepts, definitions, cause/effect, and facts worth remembering.
- Ignore chit-chat, navigation, ads, boilerplate, meta-conversation, and hedging.
- Flashcards: a short prompt on the front, a concise answer on the back. Write as many as
  the material genuinely supports, up to ${MAX_ITEMS} — do not pad with trivia to hit a number.
- Quiz: write one question per flashcard, covering that same fact, in the same order, up
  to ${MAX_ITEMS} questions. The user picks how many to sit, so a full set of questions matters.
- Quiz: 4 options each, exactly one correct; "answer" is the 0-based index.
- Vary which index is correct across questions — do not put the answer in the same slot
  every time.
- Distractors must be plausible and drawn from the same subject as the answer. Never use
  filler like "none of the above" or answers of obviously different length or specificity.
- Keep everything grounded in the provided text. Do not invent facts not present.
- Set "mode" to "coding" only when the material is about programming or software — a language, an API, an algorithm, a data structure, a framework, SQL, shell — such that a student could practise it by writing code. Everything else is "general". Material that merely mentions technology (a history of the internet, the ethics of AI, a product management article) is "general".

Respond with ONLY valid JSON, no markdown fences, matching exactly:
{
  "flashcards": [{ "front": string, "back": string }],
  "quiz": [{ "q": string, "options": [string, string, string, string], "answer": number, "explain": string }],
  "mode": "coding" | "general"
}`;

const GRADE_PROMPT = `You are a fair, concise exam grader. You get a question, the reference
answer (ground truth from the user's own study material), and the student's typed answer.

Rules:
- Judge only against the reference. Never invent facts or require knowledge not in it.
- Award partial credit for partially correct answers.
- "feedback" is 1-3 sentences: what was right, what was missing/wrong.

Respond with ONLY valid JSON: { "score": number 0-100, "correct": boolean, "feedback": string }`;

const HYPOTHETICAL_PROMPT = `You are a study-practice generator. You get a concept (a flashcard
front/back pair from the user's own material) and must write ONE fresh application exercise that
tests the same concept in a new scenario — a new fact pattern, example, or situation the student
hasn't seen.

Rules:
- The exercise must be answerable using only the concept provided. Do not introduce facts the
  concept doesn't support, and never fabricate citations, statistics, or legal/medical facts.
- "scenario" is 2-5 sentences ending with a clear question or task.
- "rubric" is the reference answer/key points a correct response must cover (grounded in the concept).

Respond with ONLY valid JSON: { "scenario": string, "rubric": string }`;

const SUMMARIZE_PROMPT = `You are a study summarizer. You get a transcript of a conversation the
user had while learning. Produce a concise TL;DR and the key takeaways.

Rules:
- Ground everything in the transcript; do not add outside knowledge.
- "summary" is 2-4 sentences in plain language.
- "keyPoints" is 3-6 short bullet strings.

Respond with ONLY valid JSON: { "summary": string, "keyPoints": [string] }`;

const BLURB_PROMPT = `You get the title and flashcard fronts of a study set. Write a single tiny
description of what this set covers — a natural phrase of 5-6 words, no quotes, no ending period.

Respond with ONLY valid JSON: { "blurb": string }`;

// --- parsing helpers -----------------------------------------------------------

export function extractJson(raw: string): any {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in model response.");
  return JSON.parse(candidate.slice(start, end + 1));
}

async function callJson(system: string, user: string): Promise<any> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await callLLM(system, user);
    try {
      return extractJson(raw);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new LLMError(`Couldn't parse model response: ${lastErr instanceof Error ? lastErr.message : "unknown"}`);
}

function transcript(messages: { role: string; text: string }[]): string {
  return messages.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`).join("\n\n");
}

// --- public API ----------------------------------------------------------------

export interface GeneratedCard { id: string; front: string; back: string }
export interface GeneratedQuiz { id: string; q: string; options: string[]; answer: number; explain: string }

export async function generateStudySet(messages: { role: string; text: string }[]) {
  const user = "Here is the conversation transcript:\n\n" + transcript(messages) + "\n\nGenerate the study material now.";
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const parsed = await callJson(GENERATE_PROMPT, user);
    const flashcards: GeneratedCard[] = (parsed.flashcards || [])
      .filter((c: any) => c && c.front && c.back)
      .map((c: any) => ({ id: randomUUID(), front: String(c.front), back: String(c.back) }));
    const quiz: GeneratedQuiz[] = (parsed.quiz || [])
      .filter((q: any) => q && q.q && Array.isArray(q.options) && q.options.length >= 2)
      .map((q: any) => ({
        id: randomUUID(),
        q: String(q.q),
        options: q.options.map(String),
        answer: Math.max(0, Math.min(q.options.length - 1, Number(q.answer) || 0)),
        explain: q.explain ? String(q.explain) : "",
      }));
    const mode = String(parsed.mode).toLowerCase() === "coding" ? "coding" : "general";
    if (flashcards.length || quiz.length) return { flashcards, quiz, mode };
    lastErr = new Error("Model returned no usable cards.");
  }
  throw new LLMError(`Generation failed: ${lastErr instanceof Error ? lastErr.message : "unknown"}`);
}

export async function gradeAnswer(question: string, reference: string, answer: string) {
  const user = `Question: ${question}\n\nReference answer:\n${reference}\n\nStudent's answer:\n${answer}\n\nGrade it now.`;
  const parsed = await callJson(GRADE_PROMPT, user);
  const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
  return {
    score,
    correct: typeof parsed.correct === "boolean" ? parsed.correct : score >= 60,
    feedback: String(parsed.feedback || ""),
  };
}

export async function generateHypothetical(concept: string, reference: string) {
  const user = `Concept (flashcard front):\n${concept}\n\nReference (flashcard back):\n${reference}\n\nWrite the exercise now.`;
  const parsed = await callJson(HYPOTHETICAL_PROMPT, user);
  if (!parsed.scenario || !parsed.rubric) throw new LLMError("Model returned an incomplete exercise.");
  return { scenario: String(parsed.scenario), rubric: String(parsed.rubric) };
}

export async function summarizeConversation(messages: { role: string; text: string }[]) {
  const user = "Here is the conversation transcript:\n\n" + transcript(messages) + "\n\nSummarize it now.";
  const parsed = await callJson(SUMMARIZE_PROMPT, user);
  return {
    summary: String(parsed.summary || ""),
    keyPoints: (parsed.keyPoints || []).map(String).slice(0, 6),
  };
}

/** Tiny 5-6 word description of a set, from its title + card fronts. */
export async function setBlurb(title: string, cardFronts: string[]) {
  const fronts = cardFronts.slice(0, 12).map((f) => `- ${f}`).join("\n");
  const user = `Set title: ${title || "(untitled)"}\n\nCard fronts:\n${fronts}\n\nWrite the blurb now.`;
  const parsed = await callJson(BLURB_PROMPT, user);
  const blurb = String(parsed.blurb || "").replace(/^["']|["']$/g, "").replace(/\.$/, "").trim();
  if (!blurb) throw new LLMError("Model returned an empty blurb.");
  return { blurb: blurb.split(/\s+/).slice(0, 8).join(" ") };
}

// --- coding mode ---------------------------------------------------------------
// Practice loop for code: a card's concept becomes one small task, the user writes
// code, and it is graded against a rubric. Scope is controlled by the starter stub,
// not by a length rule — a raw line cap rejects correct code and is wrong across
// languages (Java needs roughly 3x the lines of Python for the same idea).

/** Hard ceiling on a submission. Also enforced in schema.ts — never trust the client. */
export const MAX_CODE_CHARS = 4000;

const CODING_TASK_PROMPT = `You are a programming-practice generator. You get one concept from the
user's own study material (a flashcard front/back pair) and must write ONE tiny coding exercise
that makes them apply it.

Rules:
- The task must be SMALL — solvable in about 8-25 lines. One idea, one class or one function.
  Never ask for a whole program, a CLI, tests, error handling, or persistence.
- "starter" is a stub the user fills in: the signature/class shell plus a comment marking where
  their code goes. This is what keeps the task small, so make it specific and complete.
- "expectedLines" is your honest estimate of a good solution's length, counting the starter.
- "language" is inferred from the concept — a lowercase identifier such as "java", "python",
  "javascript", "sql". If the concept names no language, choose the one it most obviously implies.
- "scenario" is 1-3 sentences: what to build and what it must guarantee. Concrete, not abstract.
- "rubric" is 2-4 SHORT, individually checkable requirements — each one thing a correct solution
  must do. These are shown to the user as a checklist, so phrase them as observable properties
  ("balance cannot be assigned from outside the class"), never as vague goals ("good design").

Respond with ONLY valid JSON:
{ "scenario": string, "language": string, "starter": string, "expectedLines": number, "rubric": [string] }`;

const CODING_GRADE_PROMPT = `You are a fair, concise code reviewer grading a small practice exercise.
You get the task, the rubric it must satisfy, the language, and the student's code.

Rules:
- Judge each rubric requirement independently and report it as met or not met. "note" is at most
  one sentence saying why — quote the relevant line when it helps.
- Judge only what the rubric asks. Do not require patterns, naming, tests, or error handling the
  task never asked for, and do not invent extra requirements.
- Working code that satisfies every requirement is correct even if you would have written it
  differently.
- "conciseness" is one sentence about length relative to what the task needed. If the solution is
  far longer than expected, say plainly what was unnecessary. If it is about right, say so briefly.
  Length alone never makes a correct solution incorrect.
- "feedback" is 1-3 sentences: what was right, then the single most useful improvement.

Respond with ONLY valid JSON:
{ "correct": boolean, "score": number 0-100, "meets": [{ "requirement": string, "met": boolean, "note": string }],
  "conciseness": string, "feedback": string }`;

export interface CodingTask {
  scenario: string;
  language: string;
  starter: string;
  expectedLines: number;
  rubric: string[];
}

export async function generateCodingTask(concept: string, reference: string, language?: string) {
  const hint = language ? `\n\nUse this language: ${language}` : "";
  const user = `Concept (flashcard front):\n${concept}\n\nReference (flashcard back):\n${reference}${hint}\n\nWrite the exercise now.`;
  const parsed = await callJson(CODING_TASK_PROMPT, user);

  const rubric = (Array.isArray(parsed.rubric) ? parsed.rubric : [])
    .map((r: any) => String(r).trim())
    .filter(Boolean)
    .slice(0, 4);
  if (!parsed.scenario || !rubric.length) throw new LLMError("Model returned an incomplete exercise.");

  return {
    scenario: String(parsed.scenario),
    // Keep the language a bare identifier: it is rendered as a label and used as a
    // prompt hint, and models like to answer "Java (17+)".
    language: String(parsed.language || language || "text").toLowerCase().replace(/[^a-z0-9+#-]/g, "").slice(0, 20) || "text",
    starter: String(parsed.starter || ""),
    // Clamp to the "bite-sized" promise even if the model overreaches.
    expectedLines: Math.max(3, Math.min(60, Math.round(Number(parsed.expectedLines) || 15))),
    rubric,
  } satisfies CodingTask;
}

/** Non-blank, non-comment-only lines — what "how long is this" should mean. */
export function codeLineCount(code: string): number {
  return code
    .split(/\r?\n/)
    .filter((l) => {
      const t = l.trim();
      return t && !/^(\/\/|#|--|\/\*|\*\/|\*)/.test(t);
    }).length;
}

export async function gradeCode(input: {
  task: string;
  rubric: string[];
  language: string;
  expectedLines: number;
  code: string;
}) {
  // The counts are computed here, not asked of the model — it only supplies judgment.
  const actual = codeLineCount(input.code);
  const user = [
    `Task:\n${input.task}`,
    `Language: ${input.language}`,
    `Rubric (judge each one):\n${input.rubric.map((r, i) => `${i + 1}. ${r}`).join("\n")}`,
    `Expected length: about ${input.expectedLines} lines. This submission: ${actual} lines.`,
    `Student's code:\n\`\`\`\n${input.code}\n\`\`\``,
    "Grade it now.",
  ].join("\n\n");

  const parsed = await callJson(CODING_GRADE_PROMPT, user);
  const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));

  // Align the checklist to the rubric we sent: the model may drop, reorder, or
  // invent entries, and the UI renders one row per requirement.
  const byText = new Map(
    (Array.isArray(parsed.meets) ? parsed.meets : []).map((m: any) => [String(m?.requirement || "").trim(), m])
  );
  const meets = input.rubric.map((requirement, i) => {
    const m: any = byText.get(requirement) ?? (Array.isArray(parsed.meets) ? parsed.meets[i] : null);
    return {
      requirement,
      met: !!(m && m.met),
      note: String(m?.note || ""),
    };
  });

  return {
    score,
    correct: typeof parsed.correct === "boolean" ? parsed.correct : meets.every((m) => m.met),
    meets,
    conciseness: {
      expected: input.expectedLines,
      actual,
      note: String(parsed.conciseness || ""),
    },
    feedback: String(parsed.feedback || ""),
  };
}
