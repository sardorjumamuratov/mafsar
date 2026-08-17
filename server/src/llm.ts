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
          generationConfig: { temperature: 0.4, responseMimeType: "application/json" },
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
        body: { model, max_tokens: 4096, system, messages: [{ role: "user", content: user }] },
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
- Flashcards: a short prompt on the front, a concise answer on the back.
- Quiz: 4 options each, exactly one correct; "answer" is the 0-based index.
- Keep everything grounded in the provided text. Do not invent facts not present.

Respond with ONLY valid JSON, no markdown fences, matching exactly:
{
  "flashcards": [{ "front": string, "back": string }],
  "quiz": [{ "q": string, "options": [string, string, string, string], "answer": number, "explain": string }]
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
  throw new Error(`Couldn't parse model response: ${lastErr instanceof Error ? lastErr.message : "unknown"}`);
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
    if (flashcards.length || quiz.length) return { flashcards, quiz };
    lastErr = new Error("Model returned no usable cards.");
  }
  throw new Error(`Generation failed: ${lastErr instanceof Error ? lastErr.message : "unknown"}`);
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
  if (!parsed.scenario || !parsed.rubric) throw new Error("Model returned an incomplete exercise.");
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
  if (!blurb) throw new Error("Model returned an empty blurb.");
  return { blurb: blurb.split(/\s+/).slice(0, 8).join(" ") };
}
