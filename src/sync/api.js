// Backend API client for the LLM endpoints. The user's key never touches the
// extension anymore — generation/grading run server-side; auth comes from the
// signed-in account token.

import { authedFetch } from "./auth.js";

async function post(path, body) {
  const res = await authedFetch(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  // `message` carries the human-readable reason (e.g. an LLM misconfiguration);
  // `error` is the machine code. Prefer the former so the toast is actionable.
  if (!res.ok) throw new Error(data.message || data.error || `Request failed (${res.status})`);
  return data;
}

/** messages: [{role, text}] -> { flashcards:[{front,back}], quiz:[{q,options,answer,explain}] } */
export function backendGenerate(messages, title) {
  return post("/v1/generate", { messages, title });
}

/** { question, reference, answer } -> { score, correct, feedback } */
export function backendGrade({ question, reference, answer }) {
  return post("/v1/grade", { question, reference, answer });
}

/** { concept, reference } -> { scenario, rubric } */
export function backendHypothetical({ concept, reference }) {
  return post("/v1/hypothetical", { concept, reference });
}

/** messages -> { summary, keyPoints } */
export function backendSummarize(messages) {
  return post("/v1/summarize", { messages });
}

/** { title, cardFronts } -> { blurb } (tiny 5-6 word set description) */
export function backendBlurb(title, cardFronts) {
  return post("/v1/blurb", { title, cardFronts });
}
