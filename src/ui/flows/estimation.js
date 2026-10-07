import { getDefaultPracticeStyle } from "../../storage/practice-style.js";
import { esc, bundle, send, setFor, toast } from "../core.js";
import { goReturn, setFocusReturn } from "./review.js";
import { showChrome } from "../nav.js";
import { appendReviewLog, bumpActivity, uid } from "../../storage/store.js";
import { drillLogEntry } from "../../storage/drill-log.js";
import { gradeEstimation, mismatchNote, parseEstimation, parseReference } from "../../storage/estimation.js";
import { diagnoseEstimation } from "../../storage/estimation-diagnose.js";
import { bindField, feedbackSummary, openSuggestionSheet, focusEnd, paintShell, primaryBtn, secondaryBtn, verdictRow, waitRow } from "./shell.js";

// Estimate: back-of-the-envelope numbers. The model writes the questions and the
// reference answers; the learner's number is graded on this side of the wire.
export let estimationState = null; // { sessionId, topic, cards, task, idx, results, step, token, lastRaw }
export function setEstimationState(v) { estimationState = v; }

const KIND = { spot_on: "ok", ballpark: "part", off: "no", unit_mismatch: "no" };

export async function startEstimationDrill(sessionId) {
  const { sessions, studySets } = await bundle();
  const set = setFor(sessionId, studySets);
  const cards = (set?.flashcards || []).filter((c) => c.front && c.back).slice(0, 50);
  if (!cards.length) return toast("This set has no cards to drill with yet.");
  const session = sessions.find((s) => s.id === sessionId);
  const style = set?.practiceStyle || await getDefaultPracticeStyle() || "guided";

  estimationState = {
    sessionId,
    practiceStyle: style,
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
    const res = await send({ type: "ESTIMATION_TASK", concept: s.topic, reference: s.cards, practiceStyle: s.practiceStyle });
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
  
  const q = s.task.questions[s.idx];
  const isGuided = s.practiceStyle !== "simulation";
  
  if (!s.working && isGuided && q.scaffold && q.scaffold.length > 0) {
    s.working = q.scaffold.join("\n");
  }

  let extras = "";
  if (isGuided && q.nudge) {
    extras += `<div class="st-feedback st-mt16">${esc(q.nudge)}</div>`;
  }
  
  if (isGuided && s.dontKnowPressed && q.first_step) {
    extras += `<div class="st-feedback st-mt16">First step: ${esc(q.first_step)}</div>`;
  }
  
  if (isGuided && q.traffic) {
    extras += `
      <div class="st-mt16 st-label">Traffic assumption</div>
      <div class="st-mt4" style="display:flex;gap:8px">
        <button type="button" class="st-pill ${s.trafficAssumption === "average" ? "active" : ""}" data-action="estimation-traffic-average">Average</button>
        <button type="button" class="st-pill ${s.trafficAssumption === "peak" ? "active" : ""}" data-action="estimation-traffic-peak">Peak</button>
      </div>
      ${s.trafficAssumption ? `<div class="st-note st-mt8">Production systems need headroom above average traffic.</div>` : ""}
    `;
  }
  
  const toggleText = s.showWorking ? "Hide rough working" : "Show rough working (optional)";
  
  shellFor(s, {
    body: `
      ${extras}
      <div class="st-mt24">
        <input type="text" id="estimationValue" class="st-field line" placeholder="e.g. 300 TB, 12k QPS, 2.5 GB/s" aria-label="Your estimate" autocomplete="off" spellcheck="false" value="${esc(s.lastRaw)}">
        <div class="st-note st-mt4">The right order of magnitude counts.</div>
      </div>
      
      <div class="st-mt24">
        <button type="button" class="st-link" data-action="estimation-toggle-working">${toggleText}</button>
        ${s.showWorking ? `<textarea id="estimationWorking" class="st-field h80 st-mt8" placeholder="Rough working...">${esc(s.working)}</textarea>` : ""}
      </div>
    `,
    dock: `${secondaryBtn("estimation-dontknow", "Don't know")}${primaryBtn("estimation-submit", "Check", 'id="estimationCheck" disabled')}`,
  });
  
  const box = /** @type {HTMLInputElement} */ (document.getElementById("estimationValue"));
  bindField(box, { btn: /** @type {HTMLButtonElement} */ (document.getElementById("estimationCheck")), onSubmit: () => submitEstimation(), enter: true });
  
  const workingBox = /** @type {HTMLTextAreaElement} */ (document.getElementById("estimationWorking"));
  if (workingBox) {
    workingBox.addEventListener("input", () => { s.working = workingBox.value; });
  }
  
  if (!s.showWorking) focusEnd(box);
}

export function estimationAction(action) {
  const s = estimationState;
  if (!s || s.step !== "answering") return;
  const q = s.task.questions[s.idx];

  const raw = document.getElementById("estimationValue")?.value || "";
  s.lastRaw = raw;
  const workingBox = document.getElementById("estimationWorking");
  if (workingBox) s.working = workingBox.value;

  if (action === "dontknow") {
    if (s.practiceStyle !== "simulation" && !s.dontKnowPressed && q.first_step) {
      s.dontKnowPressed = true;
      s.showWorking = true;
      paintEstimationQuestion();
      return;
    }
    grade("", null);
    return;
  }
  if (action === "toggle-working") {
    s.showWorking = !s.showWorking;
    paintEstimationQuestion();
    return;
  }
  if (action === "traffic-average") {
    s.trafficAssumption = "average";
    paintEstimationQuestion();
    return;
  }
  if (action === "traffic-peak") {
    s.trafficAssumption = "peak";
    paintEstimationQuestion();
    return;
  }
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
      ${r.diagnosis ? `<div class="st-feedback st-mt16">${esc(r.diagnosis)}</div>` : ""}
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
