import { esc, bundle, send, setFor, toast } from "../core.js";
import { goReturn, setFocusReturn } from "./review.js";
import { showChrome } from "../nav.js";
import { appendReviewLog, bumpActivity, uid } from "../../storage/store.js";
import { drillLogEntry } from "../../storage/drill-log.js";
import { gradeEstimation, mismatchNote, parseEstimation, parseReference } from "../../storage/estimation.js";
import { bindField, feedbackSummary, openSuggestionSheet, focusEnd, paintShell, primaryBtn, secondaryBtn, verdictRow, waitRow } from "./shell.js";

// Estimate: back-of-the-envelope numbers. The model writes the questions and the
// reference answers; the learner's number is graded on this side of the wire.
export let estimationState = null; // { sessionId, topic, cards, task, idx, results, step, token, lastRaw }
export function setEstimationState(v) { estimationState = v; }

const KIND = { spot_on: "ok", ballpark: "part", off: "no" };

export async function startEstimationDrill(sessionId) {
  const { sessions, studySets } = await bundle();
  const set = setFor(sessionId, studySets);
  const cards = (set?.flashcards || []).filter((c) => c.front && c.back).slice(0, 50);
  if (!cards.length) return toast("This set has no cards to drill with yet.");
  const session = sessions.find((s) => s.id === sessionId);

  estimationState = {
    sessionId,
    topic: String(session?.title || set?.title || "this topic").slice(0, 200),
    cards: cards.map((c) => ({ front: c.front, back: c.back })),
    task: null,
    idx: 0,
    results: [],
    step: "generating",
    token: null,
    lastRaw: "",
  };
  setFocusReturn("set:" + sessionId);
  showChrome(false);
  paintLoader("Writing questions…");
  requestEstimationTask();
}

function paintLoader(msg, counter = "") {
  paintShell({ mode: "Estimate", progress: 0, counter, body: waitRow(msg) });
}

async function requestEstimationTask() {
  const s = estimationState;
  const token = (s.token = {});
  try {
    const res = await send({ type: "ESTIMATION_TASK", concept: s.topic, reference: s.cards });
    if (estimationState !== s || s.token !== token) return;
    s.task = res;
    s.step = "answering";
    paintEstimationQuestion();
  } catch (e) {
    if (estimationState !== s || s.token !== token) return;
    toast(e.message);
    goReturn();
  }
}

function shellFor(s, extra) {
  const q = s.task.questions[s.idx];
  paintShell({
    mode: "Estimate",
    prompt: q.question,
    promptClass: "q",
    progress: (s.idx / s.task.questions.length) * 100,
    counter: `${s.idx + 1} / ${s.task.questions.length}`,
    hasProgress: s.idx > 0 || s.step === "checked",
    ...extra,
  });
}

export function paintEstimationQuestion() {
  const s = estimationState;
  if (!s) return;
  if (s.idx >= s.task.questions.length) return finishEstimation();
  s.step = "answering";
  shellFor(s, {
    body: `
      <input type="text" id="estimationValue" class="st-field line st-mt24" placeholder="e.g. 300 TB, 12k QPS, 2.5 GB/s" aria-label="Your estimate" autocomplete="off" spellcheck="false">
      <div class="st-note">The right order of magnitude counts.</div>`,
    dock: `${secondaryBtn("estimation-dontknow", "Don't know")}${primaryBtn("estimation-submit", "Check", 'id="estimationCheck" disabled')}`,
  });
  const box = /** @type {HTMLInputElement} */ (document.getElementById("estimationValue"));
  bindField(box, { btn: /** @type {HTMLButtonElement} */ (document.getElementById("estimationCheck")), onSubmit: () => submitEstimation(), enter: true });
  focusEnd(box);
}

export function estimationAction(action) {
  if (action === "dontknow" && estimationState?.step === "answering") grade("", null);
}

export function submitEstimation() {
  const s = estimationState;
  if (!s || s.step !== "answering") return;
  const raw = /** @type {HTMLInputElement|null} */ (document.getElementById("estimationValue"))?.value.trim();
  if (!raw) return;
  const parsed = parseEstimation(raw);
  if (!parsed) return toast("Couldn't read that. Try a number with a unit, like 300 TB or 12k QPS.");
  grade(raw, parsed);
}

function grade(raw, parsed) {
  const s = estimationState;
  const q = s.task.questions[s.idx];
  let result = "off";
  let note = "";
  if (parsed) {
    // A reference unit we can't read is compared as the same kind as the answer.
    const ref = parseReference(q.reference_value, q.reference_unit) || { value: Number(q.reference_value), kind: parsed.kind };
    result = gradeEstimation(ref, parsed);
    note = mismatchNote(ref, parsed);
  }
  s.results.push({ question: q, raw, grade: result, note });
  s.lastRaw = raw;
  s.step = "checked";
  paintEstimationChecked();
}

// The grading bands are 2x for "spot on" and 10x for "ballpark" (storage/estimation.js),
// so the label states what was actually checked.
const VERDICT = {
  spot_on: "Correct · within 2×",
  ballpark: "Close · right order of magnitude",
  off: "Not quite",
};

function paintEstimationChecked() {
  const s = estimationState;
  const r = s.results[s.idx];
  const q = r.question;
  const steps = String(q.worked_solution || "").split(/\n+/).map((x) => x.trim()).filter(Boolean).slice(0, 4);
  shellFor(s, {
    body: `
      <div class="st-field line static st-mt24 ${r.grade === "spot_on" ? "ok" : "amber"}">${esc(r.raw || "Don't know")}</div>
      <div class="st-mt16">${verdictRow(KIND[r.grade], VERDICT[r.grade])}</div>
      <div class="st-label caps st-mt24">Working</div>
      <div class="st-steps">
        ${steps.map((x) => `<div>${esc(x)}</div>`).join("")}
        <div class="ctx">Reference answer: ${esc(q.reference_value)} ${esc(q.reference_unit)}${r.note ? `. ${esc(r.note)}` : ""}</div>
      </div>`,
    dock: primaryBtn("estimation-next", "Next"),
    keys: (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      estimationNext();
    },
  });
}

export function estimationNext() {
  const s = estimationState;
  if (!s || s.step !== "checked") return;
  s.idx++;
  paintEstimationQuestion();
}

async function finishEstimation() {
  const s = estimationState;
  s.step = "summarizing";
  const n = s.results.length;
  paintLoader("Writing a summary…", `${n} / ${n}`);
  const token = (s.token = {});
  try {
    const res = await send({
      type: "ESTIMATION_SUMMARY",
      results: s.results.map((r) => ({
        question: r.question.question,
        expected: `${r.question.reference_value} ${r.question.reference_unit}`,
        answer: r.raw || "(skipped)",
        grade: r.grade,
      })),
    });
    if (estimationState !== s || s.token !== token) return;
    // Spot on counts fully, ballpark half.
    const score = s.results.reduce((acc, r) => acc + (r.grade === "spot_on" ? 1 : r.grade === "ballpark" ? 0.5 : 0), 0);
    await Promise.all([
      bumpActivity(1),
      appendReviewLog(drillLogEntry({ kind: "estimation", sessionId: s.sessionId, fraction: score / n, id: uid() })),
    ]);
    paintSummary(res);
  } catch (e) {
    if (estimationState !== s || s.token !== token) return;
    toast(e.message);
    goReturn();
  }
}

function paintSummary(summary) {
  const s = estimationState;
  const n = s.results.length;
  const rows = s.results.map((r) => `
    <div class="st-li roomy">
      ${verdictRow(KIND[r.grade], r.raw ? `${VERDICT[r.grade]} · ${r.raw}` : "Skipped")}
      <div class="st-feedback">${esc(r.question.question)}</div>
    </div>`).join("");
    
  const score = s.results.reduce((acc, r) => acc + (r.grade === "spot_on" ? 1 : r.grade === "ballpark" ? 0.5 : 0), 0);
  const scoreLine = `Score ${score} / ${n}`;
  
  const summaryBlock = feedbackSummary({
    strongest: summary.strongest_habit,
    gap: summary.habit_to_fix,
    scoreLine
  });

  paintShell({
    mode: "Estimate",
    prompt: "Round complete",
    promptClass: "ask",
    progress: 100,
    counter: `${n} / ${n}`,
    body: `
      <div class="st-mt24">${summaryBlock}</div>
      <button type="button" class="st-link st-mt12" id="estSuggestBtn">Turn gaps into review cards</button>
      ${summary.notes && summary.notes.length > 0 ? `
      <div class="st-label st-mt24">Notes</div>
      <div class="st-list">${summary.notes.map(note => `<div class="st-li st-feedback">${esc(note.message)}</div>`).join("")}</div>
      ` : ""}
      <div class="st-label st-mt24">Your answers</div>
      <div class="st-list">${rows}</div>`,
    dock: primaryBtn("return-focus", "Done"),
  });

  document.getElementById("estSuggestBtn")?.addEventListener("click", () => {
    const gaps = s.results.filter(r => r.grade !== "spot_on").map(r => ({ type: "estimation_mistake", text: `Question: ${r.question.question} \nExpected: ${r.question.reference_value} ${r.question.reference_unit} \nAnswer: ${r.raw}` }));
    if (summary.habit_to_fix) gaps.push({ type: "estimation_mistake", text: summary.habit_to_fix });
    openSuggestionSheet(s.sessionId, "estimation", gaps, s.topic, s.cards);
  });
}
