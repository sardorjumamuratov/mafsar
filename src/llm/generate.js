// Turns a captured conversation into flashcards + a multiple-choice quiz by
// calling an LLM provider. Supports multiple providers (chosen in options) so
// users can use a free API (Google Gemini, Groq) or paid Anthropic.
//
// The user supplies their own API key (stored locally). All requests run from
// the background service worker, whose host_permissions allow the cross-origin
// calls without CORS trouble.

import { initSchedule } from "../storage/srs.js";
import { uid } from "../storage/store.js";

const SYSTEM_PROMPT = `You are a study-tool generator. You are given a transcript of a conversation
between a user and an AI assistant that the user had while learning something.
Extract the durable, factual knowledge the user should remember and produce study material.

Rules:
- Focus on concepts, definitions, cause/effect, and facts worth remembering.
- Ignore chit-chat, meta-conversation, and the assistant's hedging.
- Flashcards: a short prompt on the front, a concise answer on the back.
- Quiz: 4 options each, exactly one correct; "answer" is the 0-based index.
- Keep everything grounded in the transcript. Do not invent facts not present.

Respond with ONLY valid JSON, no markdown fences, matching exactly:
{
  "flashcards": [{ "front": string, "back": string }],
  "quiz": [{ "q": string, "options": [string, string, string, string], "answer": number, "explain": string }]
}`;

// --- Provider adapters ------------------------------------------------------
// Each provider knows how to build its request and pull text/errors out of the
// response. Same prompt + same JSON contract across all of them.

export const PROVIDERS = {
  gemini: {
    label: "Google Gemini",
    defaultModel: "gemini-2.0-flash",
    models: ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-flash", "gemini-1.5-flash-8b"],
    consoleUrl: "https://aistudio.google.com/app/apikey",
    buildRequest({ apiKey, model, system, user }) {
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          model
        )}:generateContent`,
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: {
          system_instruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { temperature: 0.4, responseMimeType: "application/json" },
        },
      };
    },
    extractText: (d) => (d?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join(""),
    extractError: (d, status) => d?.error?.message || `HTTP ${status}`,
  },

  groq: {
    label: "Groq (Llama)",
    defaultModel: "llama-3.3-70b-versatile",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "gemma2-9b-it"],
    consoleUrl: "https://console.groq.com/keys",
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
    label: "Anthropic (Claude)",
    defaultModel: "claude-sonnet-5",
    models: ["claude-sonnet-5", "claude-opus-4-8", "claude-haiku-4-5-20251001"],
    consoleUrl: "https://console.anthropic.com/",
    buildRequest({ apiKey, model, system, user }) {
      return {
        url: "https://api.anthropic.com/v1/messages",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: { model, max_tokens: 4096, system, messages: [{ role: "user", content: user }] },
      };
    },
    extractText: (d) => (d?.content || []).filter((b) => b.type === "text").map((b) => b.text).join(""),
    extractError: (d, status) => d?.error?.message || `HTTP ${status}`,
  },
};

export function providerDefaultModel(provider) {
  return (PROVIDERS[provider] || PROVIDERS.gemini).defaultModel;
}

export function providerModels(provider) {
  return (PROVIDERS[provider] || PROVIDERS.gemini).models || [];
}

// --- Parsing helpers --------------------------------------------------------

function transcriptToText(messages) {
  return messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`)
    .join("\n\n");
}

function extractJson(raw) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in model response.");
  return JSON.parse(candidate.slice(start, end + 1));
}

function normalize(parsed) {
  const now = Date.now();
  const flashcards = (parsed.flashcards || [])
    .filter((c) => c && c.front && c.back)
    .map((c) => ({
      id: uid(),
      front: String(c.front),
      back: String(c.back),
      ...initSchedule(now),
    }));

  const quiz = (parsed.quiz || [])
    .filter((q) => q && q.q && Array.isArray(q.options) && q.options.length >= 2)
    .map((q) => ({
      id: uid(),
      q: String(q.q),
      options: q.options.map(String),
      answer: Math.max(0, Math.min(q.options.length - 1, Number(q.answer) || 0)),
      explain: q.explain ? String(q.explain) : "",
    }));

  return { flashcards, quiz };
}

async function callApi(provider, { apiKey, model, system, user }) {
  const req = provider.buildRequest({ apiKey, model, system, user });
  const res = await fetch(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify(req.body),
  });

  if (!res.ok) {
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* ignore */
    }
    throw new Error(provider.extractError(data, res.status));
  }

  const data = await res.json();
  return provider.extractText(data);
}

/**
 * Generate a study set from a captured session.
 * @param {{provider:string, apiKey:string, model:string}} settings
 * @param {{messages:{role:string,text:string}[]}} session
 * @returns {Promise<{flashcards:Array, quiz:Array}>}
 */
export async function generateStudySet(settings, session) {
  const user =
    "Here is the conversation transcript:\n\n" +
    transcriptToText(session.messages) +
    "\n\nGenerate the study material now.";
  // One retry on malformed JSON.
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await callLLM(settings, { system: SYSTEM_PROMPT, user });
    try {
      const normalized = normalize(extractJson(raw));
      if (!normalized.flashcards.length && !normalized.quiz.length) {
        throw new Error("Model returned no usable cards.");
      }
      return normalized;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`Couldn't parse study material: ${lastErr?.message || "unknown error"}`);
}

// --- Task-specific prompts (all grounded strictly in user-supplied source) ---

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

/** Shared low-level call: any { system, user } prompt pair against the user's provider. */
export async function callLLM(settings, { system, user }) {
  const provider = PROVIDERS[settings.provider] || PROVIDERS.gemini;
  if (!settings.apiKey) {
    throw new Error(`No API key set. Add your ${provider.label} API key in the extension options.`);
  }
  const model = settings.model || provider.defaultModel;
  return callApi(provider, { apiKey: settings.apiKey, model, system, user });
}

// One retry on malformed JSON, shared by the small task prompts.
async function callJsonRetry(settings, system, user) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await callLLM(settings, { system, user });
    try {
      return extractJson(raw);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`Couldn't parse model response: ${lastErr?.message || "unknown error"}`);
}

/**
 * Grade a typed short answer against reference material.
 * @returns {Promise<{score:number, correct:boolean, feedback:string}>}
 */
export async function gradeAnswer(settings, { question, reference, answer }) {
  const user = `Question: ${question}\n\nReference answer:\n${reference}\n\nStudent's answer:\n${answer}\n\nGrade it now.`;
  const parsed = await callJsonRetry(settings, GRADE_PROMPT, user);
  const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
  return {
    score,
    correct: typeof parsed.correct === "boolean" ? parsed.correct : score >= 60,
    feedback: String(parsed.feedback || ""),
  };
}

/**
 * Generate a fresh application exercise (hypothetical) for a concept.
 * A new scenario each call — never cached.
 * @returns {Promise<{scenario:string, rubric:string}>}
 */
export async function generateHypothetical(settings, { concept, reference }) {
  const user = `Concept (flashcard front):\n${concept}\n\nReference (flashcard back):\n${reference}\n\nWrite the exercise now.`;
  const parsed = await callJsonRetry(settings, HYPOTHETICAL_PROMPT, user);
  if (!parsed.scenario || !parsed.rubric) throw new Error("Model returned an incomplete exercise.");
  return { scenario: String(parsed.scenario), rubric: String(parsed.rubric) };
}

/**
 * TL;DR + key takeaways for a captured conversation.
 * @returns {Promise<{summary:string, keyPoints:string[]}>}
 */
export async function summarizeConversation(settings, session) {
  const user = "Here is the conversation transcript:\n\n" +
    transcriptToText(session.messages) +
    "\n\nSummarize it now.";
  const parsed = await callJsonRetry(settings, SUMMARIZE_PROMPT, user);
  return {
    summary: String(parsed.summary || ""),
    keyPoints: (parsed.keyPoints || []).map(String).slice(0, 6),
  };
}
