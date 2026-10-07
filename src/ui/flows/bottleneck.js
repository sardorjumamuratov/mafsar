import { app, bundle, esc, send, setFor, toast } from "../core.js";
import { goReturn, setFocusReturn } from "./review.js";
import { showChrome } from "../nav.js";
import { appendReviewLog, bumpActivity, uid } from "../../storage/store.js";
import { drillLogEntry } from "../../storage/drill-log.js";
import { bindField, focusEnd, icon, paintShell, primaryBtn, verdictRow, waitRow } from "./shell.js";

// What breaks: a small architecture with one planted flaw. The learner says what
// fails, under what load or failure, and how they'd fix it.
export let bottleneckState = null; // { sessionId, topic, cards, task, hint, result, step, usedHint, draft, token }
export function setBottleneckState(v) { bottleneckState = v; }

export async function startBottleneckDrill(sessionId) {
  const { sessions, studySets } = await bundle();
  const set = setFor(sessionId, studySets);
  const cards = (set?.flashcards || []).filter((c) => c.front && c.back).slice(0, 50);
  if (!cards.length) return toast("This set has no cards to drill with yet.");
  const session = sessions.find((s) => s.id === sessionId);

  bottleneckState = {
    sessionId,
    topic: String(session?.title || set?.title || "this topic").slice(0, 200),
    cards: cards.map((c) => ({ front: c.front, back: c.back })),
    task: null,
    hint: null,
    result: null,
    step: "generating",
    usedHint: false,
    draft: "",
    token: null,
  };
  setFocusReturn("set:" + sessionId);
  showChrome(false);
  paintLoader("Designing an architecture…");
  requestBottleneckTask();
}

function paintLoader(msg) {
  paintShell({ mode: "What breaks", progress: 0, counter: "0 / 1", body: waitRow(msg) });
}

async function requestBottleneckTask() {
  const s = bottleneckState;
  const token = (s.token = {});
  try {
    const res = await send({ type: "BOTTLENECK_TASK", concept: s.topic, reference: s.cards });
    if (bottleneckState !== s || s.token !== token) return;
    s.task = res;
    s.step = "answering";
    paintBottleneckQuestion();
  } catch (e) {
    if (bottleneckState !== s || s.token !== token) return;
    toast(e.message);
    goReturn();
  }
}

/** "API servers (3x)" or "Cache: Redis" → the component and its detail, which reads in a quieter colour. */
export function splitComponent(text) {
  const t = String(text || "").trim();
  const dash = t.match(/^(.+?)(?:\s+[—–-]\s+|:\s+)(.+)$/);
  if (dash) return { name: dash[1], detail: dash[2] };
  const paren = t.match(/^(.+?)\s*\((.+)\)$/);
  if (paren) return { name: paren[1], detail: paren[2] };
  return { name: t, detail: "" };
}

/** Which component the planted flaw lives in: the one whose name the flaw text mentions, else the best word overlap. */
export function failingIndex(architecture, flaw) {
  const text = String(flaw || "").toLowerCase();
  if (!text) return -1;
  const words = (str) => new Set(str.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4));
  let best = -1;
  let bestScore = 0;
  architecture.forEach((comp, i) => {
    const { name } = splitComponent(comp);
    const n = name.toLowerCase();
    let score = text.includes(n) ? 100 : 0;
    for (const w of words(name)) if (text.includes(w)) score++;
    if (score > bestScore) { best = i; bestScore = score; }
  });
  return best;
}

function rail(architecture, amberIdx = -1) {
  return `<div class="st-rail st-mt12" role="list" aria-label="Request flow, in order">${architecture.map((comp, i) => {
    const { name, detail } = splitComponent(comp);
    const last = i === architecture.length - 1;
    return `<div class="st-row${last ? " last" : ""}" role="listitem">
        <div class="st-rail-col"><div class="st-dot sm${i === amberIdx ? " amber" : ""}"></div>${last ? "" : '<div class="st-line"></div>'}</div>
        <div class="st-cell sm">${esc(name)}${detail ? `<span class="detail"> · ${esc(detail)}</span>` : ""}</div>
      </div>`;
  }).join("")}</div>`;
}

export function paintBottleneckQuestion() {
  const s = bottleneckState;
  if (!s) return;
  s.step = "answering";
  const hint = s.usedHint
    ? `<button type="button" class="st-link" disabled>${icon("bulb", 16)}Hint used</button>`
    : `<button type="button" class="st-link" data-action="bottleneck-hint">${icon("bulb", 16)}Hint<span class="dim"> −½ pt</span></button>`;
  paintShell({
    mode: "What breaks",
    prompt: s.task.narrative,
    promptClass: "text",
    progress: 0,
    counter: "0 / 1",
    body: `
      <div class="st-label st-mt20">Architecture</div>
      ${rail(s.task.architecture || [])}
      <div class="st-qrow"><span class="st-label">What breaks, and why?</span>${hint}</div>
      ${s.hint ? `<div class="st-feedback" style="margin-top:8px">${esc(s.hint)}</div>` : ""}
      <textarea id="bottleneckAnswer" class="st-field h140 st-mt8" placeholder="What fails, under what load or failure, and how you'd fix it" aria-label="What breaks, and why">${esc(s.draft)}</textarea>`,
    dock: primaryBtn("bottleneck-submit", "Submit", 'id="bottleneckSubmit" disabled'),
  });
  const box = /** @type {HTMLTextAreaElement} */ (document.getElementById("bottleneckAnswer"));
  bindField(box, {
    btn: /** @type {HTMLButtonElement} */ (document.getElementById("bottleneckSubmit")),
    onChange: (v) => { s.draft = v; },
    onSubmit: () => submitBottleneck(),
  });
  if (!s.hint) focusEnd(box);
}

export function bottleneckAction(action) {
  const s = bottleneckState;
  if (!s) return;
  if (action === "toggle-scenario") {
    const el = document.getElementById("bnScenario");
    const btn = document.getElementById("bnScenarioBtn");
    if (!el || !btn) return;
    const clamped = el.classList.toggle("st-clamp");
    btn.textContent = clamped ? "Show full scenario" : "Hide full scenario";
  } else if (action === "toggle-model") {
    const el = document.getElementById("bnModel");
    const btn = document.getElementById("bnModelBtn");
    if (!el || !btn) return;
    el.hidden = !el.hidden;
    btn.textContent = el.hidden ? "Compare your approach" : "Hide your approach";
  }
}

export async function requestBottleneckHint() {
  const s = bottleneckState;
  if (!s || s.usedHint || s.step !== "answering") return;
  s.draft = /** @type {HTMLTextAreaElement|null} */ (document.getElementById("bottleneckAnswer"))?.value || "";
  s.usedHint = true;
  const btn = /** @type {HTMLButtonElement|null} */ (app.querySelector('[data-action="bottleneck-hint"]'));
  if (btn) btn.disabled = true;
  const token = (s.token = {});
  try {
    const res = await send({ type: "BOTTLENECK_HINT", state: s.task.state });
    if (bottleneckState !== s || s.token !== token) return;
    s.hint = res.hint;
  } catch (e) {
    if (bottleneckState !== s || s.token !== token) return;
    s.usedHint = false; // no hint was given, so none is charged
    toast(e.message);
  }
  paintBottleneckQuestion();
}

export async function submitBottleneck() {
  const s = bottleneckState;
  if (!s || s.step !== "answering") return;
  const box = document.getElementById("bottleneckAnswer");
  const answer = (/** @type {HTMLTextAreaElement|null} */ (box))?.value.trim();
  if (!answer) return;

  s.draft = answer;
  s.step = "grading";
  paintLoader("Reviewing your answer…");
  const token = (s.token = {});
  try {
    const res = await send({ type: "BOTTLENECK_GRADE", state: s.task.state, answer, usedHint: s.usedHint });
    if (bottleneckState !== s || s.token !== token) return;
    s.result = res;
    s.step = "checked";
    await Promise.all([
      bumpActivity(1),
      appendReviewLog(drillLogEntry({ kind: "bottleneck", sessionId: s.sessionId, fraction: (Number(res.score) || 0) / 3, id: uid() })),
    ]);
    paintBottleneckFeedback();
  } catch (e) {
    if (bottleneckState !== s || s.token !== token) return;
    toast(e.message);
    paintBottleneckQuestion();
  }
}

function paintBottleneckFeedback() {
  const s = bottleneckState;
  const r = s.result;
  const parts = Number(!!r.found_flaw) + Number(!!r.explanation_correct) + Number(!!r.fix_works);
  const kind = parts === 3 ? "ok" : parts > 0 ? "part" : "no";
  const label = { ok: "Correct", part: "Partly right", no: "Not quite" }[kind];
  const arch = s.task.architecture || [];
  paintShell({
    mode: "What breaks",
    progress: 100,
    counter: "1 / 1",
    hasProgress: true,
    promptHtml: `<div class="st-prompt text st-clamp" id="bnScenario">${esc(s.task.narrative)}</div>`,
    body: `
      <button type="button" class="st-link st-mt6" id="bnScenarioBtn" data-action="bottleneck-toggle-scenario">Show full scenario</button>
      <div class="st-label st-mt20">Architecture</div>
      ${rail(arch, failingIndex(arch, r.planted_flaw))}
      <div class="st-mt24">${verdictRow(kind, label)}</div>
      ${r.feedback ? `<div class="st-feedback">${esc(r.feedback)}</div>` : ""}
      ${r.other_valid_issue ? `<div class="st-feedback">You also spotted a real problem: ${esc(r.other_valid_issue)}</div>` : ""}
      ${r.usedHint ? `<div class="st-note">Score ${esc(r.score)} / 3, with the hint's half point taken off.</div>` : `<div class="st-note">Score ${esc(r.score)} / 3.</div>`}
      <button type="button" class="st-link st-mt12" id="bnModelBtn" data-action="bottleneck-toggle-model">Compare your approach</button>
      <div id="bnModel" hidden>
        <div class="st-label st-mt16">The flaw</div>
        <div class="st-text15 st-mt4">${esc(r.planted_flaw)}</div>
        ${r.why_it_fails ? `<div class="st-label st-mt16">Why it fails</div><div class="st-text15 st-mt4">${esc(r.why_it_fails)}</div>` : ""}
        <div class="st-label st-mt16">A good fix</div>
        <div class="st-text15 st-mt4">${esc(r.model_solution)}</div>
      </div>`,
    dock: primaryBtn("return-focus", "Finish"),
  });
}
