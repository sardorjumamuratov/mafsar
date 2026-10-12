import { esc, bundle, send, setFor, toast } from "../core.js";
import { goReturn, setFocusReturn } from "./review.js";
import { showChrome } from "../nav.js";
import { annotateReviewLog, appendReviewLog, bumpActivity, uid } from "../../storage/store.js";
import { drillLogEntry } from "../../storage/drill-log.js";
import { gradeEstimation, mismatchNote, parseEstimation, parseReference } from "../../storage/estimation.js";
import { diagnoseEstimation } from "../../storage/estimation-diagnose.js";
import { styleFlags } from "../../storage/practice-style.js";
import { bindField, focusEnd, metaEnter, offerReviewCards, paintShell, primaryBtn, reviewCardsAction, secondaryBtn, setReviewCards, verdictRow, waitRow } from "./shell.js";

// Estimate (docs/prompts/38 §8): back-of-the-envelope numbers. The model writes
// the questions and reference answers; the learner's number is graded on this
// side of the wire (storage/estimation.js), with no model call per question.
// Optional rough working is kept per question and analysed once, at round end.
export let estimationState = null;
export function setEstimationState(v) { estimationState = v; }

// Grader result → screen status, verdict kind and label.
const STATUS = { spot_on: "correct", ballpark: "close", off: "not_quite", unit_mismatch: "unit_mismatch" };
const KIND = { correct: "ok", close: "part", not_quite: "no", unit_mismatch: "no" };
// The bands are 2x and 10x (storage/estimation.js), so the label states what was checked.
const LABEL = { correct: "Correct · within 2×", close: "Close · right order of magnitude", not_quite: "Not quite", unit_mismatch: "Unit mismatch" };
const SCORE = { correct: 1, close: 0.5, not_quite: 0, unit_mismatch: 0 };

export async function startEstimationDrill(sessionId, style = "simulation") {
  const { sessions, studySets } = await bundle();
  const set = setFor(sessionId, studySets);
  const cards = (set?.flashcards || []).filter((c) => c.front && c.back && !c.deleted).slice(0, 50);
  if (!cards.length) return toast("This set has no cards to drill with yet.");
  estimationState = {
    sessionId,
    style,
    flags: styleFlags(style),
    topic: String(sessions.find((x) => x.id === sessionId)?.title || set?.title || "this topic").slice(0, 200),
    cards: cards.map((c) => ({ front: c.front, back: c.back })),
    task: null,
    idx: 0,
    step: "generating", // generating | answering | checked | summarizing | done
    results: [],
    raw: {}, working: {}, workingOpen: {}, traffic: {}, firstStepShown: {},
    startedAt: Date.now(),
    token: null,
    logId: null,
  };
  setFocusReturn("set:" + sessionId);
  showChrome(false);
  paintLoader("Creating estimation questions from this set…");
  requestEstimationTask();
}

function paintLoader(msg, counter = "") {
  paintShell({ mode: "Estimate", progress: 0, counter, body: waitRow(msg) });
}

async function requestEstimationTask() {
  const s = estimationState;
  const token = (s.token = {});
  try {
    const res = await send({ type: "ESTIMATION_TASK", concept: s.topic, reference: s.cards, practiceStyle: s.style });
    if (estimationState !== s || s.token !== token) return;
    s.task = res;
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

/** The scaffold is offered as editable text; the learner can rewrite it freely. */
const scaffoldText = (q) => (Array.isArray(q.scaffold) ? q.scaffold.join("\n") : "");

export function paintEstimationQuestion() {
  const s = estimationState;
  if (!s) return;
  if (s.idx >= s.task.questions.length) return finishEstimation();
  s.step = "answering";
  const q = s.task.questions[s.idx];
  const i = s.idx;
  const guided = s.flags.scaffolds;
  if (s.workingOpen[i] === undefined) s.workingOpen[i] = s.flags.workingOpen;
  if (s.working[i] === undefined) s.working[i] = guided ? scaffoldText(q) : "";
  const showTraffic = (guided && q.traffic) || (!guided && q.traffic === "peak" && /peak/i.test(q.question));

  shellFor(s, {
    body: `
      ${guided && q.nudge ? `<div class="st-hint st-mt8">${esc(q.nudge)}</div>` : ""}
      <label class="st-fieldlabel st-mt24">
        <span class="st-label">Your estimate</span>
        <input type="text" id="estimationValue" class="st-field line" placeholder="e.g. 12k QPS, 300 TB, 2.5 GB/s" autocomplete="off" spellcheck="false" value="${esc(s.raw[i] || "")}">
      </label>
      <div class="st-note">The right order of magnitude counts.</div>
      ${s.firstStepShown[i] && q.first_step ? `<div class="st-feedback st-mt8" role="status">First step: ${esc(q.first_step)}</div>` : ""}
      ${showTraffic ? `
        <div class="st-label st-mt20" id="trafficLabel">Traffic assumption</div>
        <div class="st-seg st-mt8" role="group" aria-labelledby="trafficLabel">
          <button type="button" data-action="estimation-traffic" data-traffic="average" class="${s.traffic[i] === "average" ? "on" : ""}" aria-pressed="${s.traffic[i] === "average"}">Average</button>
          <button type="button" data-action="estimation-traffic" data-traffic="peak" class="${s.traffic[i] === "peak" ? "on" : ""}" aria-pressed="${s.traffic[i] === "peak"}">Peak</button>
        </div>
        ${guided ? `<div class="st-note">Production systems need headroom above average traffic.</div>` : ""}` : ""}
      <button type="button" class="st-link st-mt16" data-action="estimation-toggle-working" id="workingToggle" aria-expanded="${!!s.workingOpen[i]}" aria-controls="workingBox">${s.workingOpen[i] ? "Hide rough working" : "Show rough working (optional)"}</button>
      <div id="workingBox"${s.workingOpen[i] ? "" : " hidden"}>
        <textarea id="estWorking" class="st-field h96 st-mt8" maxlength="800" placeholder="e.g. 50M users × 20 requests/day = ?" aria-label="Rough working">${esc(s.working[i] || "")}</textarea>
      </div>`,
    dock: `${secondaryBtn("estimation-dontknow", guided && q.first_step && !s.firstStepShown[i] ? "I'm not sure" : "Don't know")}${primaryBtn("estimation-submit", "Check", 'id="estimationCheck" disabled')}`,
  });
  const box = /** @type {HTMLInputElement} */ (document.getElementById("estimationValue"));
  bindField(box, { btn: /** @type {HTMLButtonElement} */ (document.getElementById("estimationCheck")), onChange: (v) => { s.raw[i] = v; }, onSubmit: () => submitEstimation(), enter: true });
  const work = /** @type {HTMLTextAreaElement|null} */ (document.getElementById("estWorking"));
  if (work) bindField(work, { onChange: (v) => { s.working[i] = v; }, onSubmit: () => submitEstimation() });
  focusEnd(box);
}

export function estimationAction(action, payload) {
  const s = estimationState;
  if (!s) return;
  const i = s.idx;
  if (action === "dontknow" && s.step === "answering") {
    const q = s.task.questions[i];
    // Guided: the first press shows the first step; the second records "Don't know".
    if (s.flags.scaffolds && q.first_step && !s.firstStepShown[i]) {
      s.firstStepShown[i] = true;
      return paintEstimationQuestion();
    }
    grade("", null);
  } else if (action === "toggle-working" && s.step === "answering") {
    s.workingOpen[i] = !s.workingOpen[i];
    const box = document.getElementById("workingBox");
    const btn = document.getElementById("workingToggle");
    if (box) box.hidden = !s.workingOpen[i];
    if (btn) {
      btn.textContent = s.workingOpen[i] ? "Hide rough working" : "Show rough working (optional)";
      btn.setAttribute("aria-expanded", String(!!s.workingOpen[i]));
    }
    if (s.workingOpen[i]) focusEnd(/** @type {HTMLTextAreaElement|null} */ (document.getElementById("estWorking")));
  } else if (action === "traffic" && s.step === "answering") {
    s.traffic[i] = s.traffic[i] === payload ? undefined : payload;
    document.querySelectorAll('[data-action="estimation-traffic"]').forEach((b) => {
      const on = /** @type {HTMLElement} */ (b).dataset.traffic === s.traffic[i];
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    });
  }
}

export function submitEstimation() {
  const s = estimationState;
  if (!s || s.step !== "answering") return;
  const raw = (s.raw[s.idx] || "").trim();
  if (!raw) return;
  const parsed = parseEstimation(raw);
  if (!parsed) return toast("Couldn't read that. Try a number with a unit, like 300 TB or 12k QPS.");
  grade(raw, parsed);
}

function grade(raw, parsed) {
  const s = estimationState;
  const q = s.task.questions[s.idx];
  let status = "not_quite";
  let note = "";
  let diagnosis = null;
  if (parsed) {
    // A reference unit we can't read is compared as the same kind as the answer.
    const ref = parseReference(q.reference_value, q.reference_unit) || { value: Number(q.reference_value), kind: parsed.kind };
    status = STATUS[gradeEstimation(ref, parsed)] || "not_quite";
    note = mismatchNote(ref, parsed);
    if (status !== "correct" && status !== "unit_mismatch") diagnosis = diagnoseEstimation(parsed.value, ref.value, q.traffic === "peak");
  }
  const working = (s.working[s.idx] || "").trim();
  const traffic = s.traffic[s.idx];
  s.results.push({
    question: q, raw, status, note, diagnosis,
    working: working && working !== scaffoldText(q).trim() ? working : "",
    traffic: traffic || "",
    usedFirstStep: !!s.firstStepShown[s.idx],
  });
  s.step = "checked";
  paintEstimationChecked();
}

function paintEstimationChecked() {
  const s = estimationState;
  const r = s.results[s.idx];
  const q = r.question;
  const steps = String(q.worked_solution || "").split(/\n+/).map((x) => x.trim()).filter(Boolean).slice(0, 4);
  const last = s.idx + 1 >= s.task.questions.length;
  shellFor(s, {
    body: `
      <div class="st-fieldlabel st-mt24">
        <span class="st-label">Your estimate</span>
        <div class="st-field line static ${r.status === "correct" ? "ok" : "amber"}">${esc(r.raw || "Don't know")}</div>
      </div>
      <div class="st-mt16">${verdictRow(KIND[r.status], LABEL[r.status])}</div>
      ${r.note ? `<div class="st-feedback">${esc(r.note)}</div>` : ""}
      ${r.diagnosis ? `<div class="st-feedback">${esc(r.diagnosis)}</div>` : ""}
      ${r.working ? `<div class="st-label st-mt20">Your working</div><div class="st-text15 st-mt4">${esc(r.working)}</div>` : ""}
      <div class="st-label caps st-mt24">Working</div>
      <div class="st-steps">
        ${steps.map((x) => `<div>${esc(x)}</div>`).join("")}
        <div class="ctx">Reference answer: ${esc(q.reference_value)} ${esc(q.reference_unit)}</div>
      </div>`,
    dock: primaryBtn("estimation-next", last ? "Finish round" : "Next question"),
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
  if (s.step === "summarizing" || s.step === "done") return;
  s.step = "summarizing";
  const n = s.results.length;
  paintLoader("Looking at your round…", `${n} / ${n}`);
  const token = (s.token = {});
  const score = s.results.reduce((acc, r) => acc + SCORE[r.status], 0);
  s.logId = uid();
  const now = Date.now();
  // The round is saved before the summary call, so a failed summary never loses it.
  await Promise.all([
    bumpActivity(1),
    appendReviewLog(drillLogEntry({
      kind: "estimation", sessionId: s.sessionId, fraction: score / n, id: s.logId,
      meta: {
        practiceStyle: s.style, mode: "estimation", startedAt: new Date(s.startedAt).toISOString(), completedAt: new Date(now).toISOString(),
        durationMs: now - s.startedAt, usedHint: s.results.some((r) => r.usedFirstStep), hintCount: s.results.filter((r) => r.usedFirstStep).length,
      },
    })),
  ]).catch(() => {});
  let summary = { habit_to_fix: "", strongest_habit: null, notes: [], analysisFailed: true };
  try {
    summary = await send({
      type: "ESTIMATION_SUMMARY",
      practiceStyle: s.style,
      results: s.results.map((r) => ({
        question: r.question.question.slice(0, 1000),
        expected: `${r.question.reference_value} ${r.question.reference_unit}`.slice(0, 200),
        answer: (r.raw || "(skipped)").slice(0, 200),
        grade: r.status === "correct" ? "spot_on" : r.status === "close" ? "ballpark" : "off",
        status: r.status,
        ...(r.working || r.traffic ? { working: `${r.traffic ? `Assumed ${r.traffic} traffic. ` : ""}${r.working}`.slice(0, 800) } : {}),
      })),
    });
  } catch {
    // The numbers are already checked and saved; only the coaching is missing.
  }
  if (estimationState !== s || s.token !== token) return;
  s.step = "done";
  paintSummary(summary, score);
}

function paintSummary(summary, score) {
  const s = estimationState;
  const n = s.results.length;
  const fmt = (x) => (Number.isInteger(x) ? String(x) : x.toFixed(1));
  const notes = new Map((summary.notes || []).map((x) => [x.index, x.message]));
  const rows = s.results.map((r, i) => `
    <div class="st-li roomy">
      ${verdictRow(KIND[r.status], r.raw ? `${LABEL[r.status]} · ${r.raw}` : "Skipped")}
      <div class="st-feedback">${esc(r.question.question)}</div>
      ${notes.get(i) ? `<div class="st-feedback">${esc(notes.get(i))}</div>` : ""}
    </div>`).join("");
  paintShell({
    mode: "Estimate",
    prompt: "Round complete",
    promptClass: "ask",
    progress: 100,
    counter: `${n} / ${n}`,
    body: `
      <div class="st-summary st-mt16">
        <div class="st-scoreline">Score: ${fmt(score)} of ${n}</div>
        ${summary.strongest_habit ? `<div class="st-sumline ok"><div class="st-label">Strongest habit</div><div class="st-sumtext">${esc(summary.strongest_habit)}</div></div>` : ""}
        ${summary.habit_to_fix && !summary.analysisFailed ? `<div class="st-sumline gap"><div class="st-label">Most useful habit to improve</div><div class="st-sumtext">${esc(summary.habit_to_fix)}</div></div>` : ""}
        ${summary.analysisFailed ? `<div class="st-note">We could not analyze the working this time, but your numerical answers were checked.</div>` : ""}
      </div>
      <div class="st-label st-mt24">Your answers</div>
      <div class="st-list">${rows}</div>
      ${reviewCardsAction()}`,
    dock: primaryBtn("return-focus", "Done"),
  });

  setReviewCards(() => {
    const gaps = s.results.filter((r) => r.status !== "correct").map((r) => {
      const expected = `${r.question.reference_value} ${r.question.reference_unit}`;
      if (r.status === "unit_mismatch") return { type: "unit_mismatch", text: `${r.note || "The unit didn't match."} (Expected ${expected}; answered ${r.raw}.)`.slice(0, 400) };
      return { type: "estimation_mistake", text: `${r.diagnosis || `Expected about ${expected}; answered ${r.raw || "nothing"}.`} Question: ${r.question.question}`.slice(0, 400) };
    });
    if (summary.habit_to_fix && !summary.analysisFailed) gaps.unshift({ type: "estimation_mistake", text: summary.habit_to_fix.slice(0, 400) });
    offerReviewCards({
      sessionId: s.sessionId, mode: "estimation", gaps, topic: s.topic, practiceStyle: s.style,
      onSaved: (ids) => { if (s.logId) annotateReviewLog(s.logId, { savedSuggestedCardIds: ids }).catch(() => {}); },
    });
  });
}
