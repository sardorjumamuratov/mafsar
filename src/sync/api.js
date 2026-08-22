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

/** { concept, reference, language? } -> { scenario, language, starter, expectedLines, rubric } */
export function backendCodingTask({ concept, reference, language }) {
  return post("/v1/coding-task", { concept, reference, language });
}

/** Rubric-graded code -> { correct, score, meets, conciseness, feedback } */
export function backendCodingGrade({ task, rubric, language, expectedLines, code }) {
  return post("/v1/coding-grade", { task, rubric, language, expectedLines, code });
}

/** GET with the account token; share 404s carry a human message. */
async function get(path) {
  const res = await authedFetch(path);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || `Request failed (${res.status})`);
  return data;
}

/** { setId } -> { code } — share one of your sets as a short code. */
export function backendShareCreate(setId) {
  return post("/v1/share", { setId });
}

/** code -> { title, cards: [{front, back}], quiz: [{q, options, answer, explain}] } */
export function backendShareFetch(code) {
  return get("/v1/share/" + encodeURIComponent(code));
}

/** code -> { ok } — withdraw a share; copies already added are kept. */
export function backendShareRevoke(code) {
  return post("/v1/share/revoke", { code });
}

// --- Teams (all calls need the signed-in account token) ------------------------

/** name -> { id, name, code } — creator becomes the first member. */
export function backendTeamCreate(name) {
  return post("/v1/teams", { name });
}

/** code -> { id, name, code } — join (idempotent) or 404 on an unknown code. */
export function backendTeamJoin(code) {
  return post("/v1/teams/join", { code });
}

/** -> [{ id, name, code, memberCount }] — teams the caller belongs to. */
export async function backendTeamList() {
  return get("/v1/teams");
}

/** id -> { id, name, code, members, leaderboard, learning } — members only. */
export function backendTeamGet(id) {
  return get("/v1/teams/" + encodeURIComponent(id));
}

/** id -> { ok } — remove the caller from the team. */
export function backendTeamLeave(id) {
  return post(`/v1/teams/${encodeURIComponent(id)}/leave`, {});
}
