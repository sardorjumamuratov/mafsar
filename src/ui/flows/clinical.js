import { app, bundle, esc, send, setFor, toast } from "../core.js";
import { goReturn, setFocusReturn } from "./review.js";
import { showChrome } from "../nav.js";
import { annotateReviewLog, appendReviewLog, bumpActivity, getReviewLog, uid } from "../../storage/store.js";
import { drillLogEntry } from "../../storage/drill-log.js";
import { styleFlags } from "../../storage/practice-style.js";
import { levelLabel, nextLevel, suggestStepUp } from "../../storage/practice-level.js";
import { levelFor, setLevel } from "../practice-ui.js";
import {
  bindField, feedbackSummary, focusEnd, icon, metaEnter, offerReviewCards, paintShell, primaryBtn, reviewCardsAction,
  secondaryBtn, setReviewCards, typing, verdictRow, waitRow,
} from "./shell.js";

// Clinical case (docs/prompts/39): three short cases, each a vignette and 3-4
// one-decision steps, built from the learner's own notes. Answers are taps or a
// line; the answer key stays sealed on the server until a step is checked.
// - Learn concepts: each step is checked at once and explained, hints are free.
// - Interview simulation: answers lock as you go and the verdicts wait for the
//   case summary; typed answers are graded together at the end of the case.
const CASES = 3;
const MAX_ANSWER = 200;
const VERDICT_KIND = { correct: "ok", partial: "part", not_quite: "no" };
const VERDICT_LABEL = { correct: "Correct", partial: "Partly right", not_quite: "Not quite" };
const VERDICT_SCORE = { correct: 1, partial: 0.5, not_quite: 0 };
const AREA_NAME = { diagnosis: "Diagnosis", symptoms: "Key finding", tests: "Choosing a test", treatment: "Treatment", redFlags: "Warning signs", differentials: "Telling it apart" };
const GENERAL = "General knowledge, not from your notes";

// { sessionId, setName, topic, style, flags, level, caseIdx, phase, kase, stepIdx, answers, hints, ordered, other,
//   done, busy, token, startedAt, caseScores, areaTally, logId, hintCount }
let state = null;

export async function startClinicalCase(sessionId, style = "simulation") {
  const { sessions, studySets } = await bundle();
  const set = setFor(sessionId, studySets);
  const cards = (set?.flashcards || []).filter((c) => c.front && c.back && !c.deleted);
  const chains = (set?.chains || []).filter((c) => !c.deleted);
  if (!cards.length && !chains.length) return toast("Add some cards to this set first: a case is built from your notes.");
  state = {
    sessionId,
    setName: String(sessions.find((x) => x.id === sessionId)?.title || set?.title || "").slice(0, 80),
    topic: String(sessions.find((x) => x.id === sessionId)?.title || set?.title || "Medicine").slice(0, 200),
    cards, chains,
    style, flags: styleFlags(style),
    level: await levelFor(sessionId),
    caseIdx: 1,
    caseScores: [], areaTally: {}, gaps: [], hintCount: 0,
    startedAt: Date.now(),
    token: null, logId: null,
  };
  setFocusReturn("set:" + sessionId);
  showChrome(false);
  app.dataset.drillFlow = "active";
  fetchCase();
}

const modeLabel = (s) => `Clinical case${s.setName ? ` · ${s.setName}` : ""} · ${levelLabel(s.level)}`;
const shellBase = (s) => ({
  mode: modeLabel(s),
  counter: `${s.caseIdx} / ${CASES}`,
  progress: (((s.caseIdx - 1) + (s.kase ? Math.min(1, Object.keys(s.answers || {}).length / s.kase.steps.length) : 0)) / CASES) * 100,
});

async function fetchCase() {
  const s = state;
  s.phase = "loading";
  s.kase = null;
  s.stepIdx = 0;
  s.answers = {};
  s.hints = {};
  s.ordered = [];
  s.other = [];
  s.done = false;
  s.busy = false;
  s.pick = null;
  paintShell({ ...shellBase(s), body: waitRow("Writing a case from your notes…") });
  const token = (s.token = {});
  try {
    const chains = s.chains.map((c) => ({
      title: String(c.title || "").slice(0, 200),
      steps: (c.steps || []).filter((x) => x.statement && !x.deleted).slice(0, 10)
        .map((x) => ({ label: String(x.key || "").slice(0, 80), statement: String(x.statement).slice(0, 300), why: String(x.why || "").slice(0, 300) })),
    })).slice(0, 20);
    const reference = s.cards.slice(0, 50).map((c) => ({ front: String(c.front).slice(0, 500), back: String(c.back).slice(0, 2000) }));
    const res = await send({ type: "CLINICAL_CASE", concept: s.topic, reference, chains, level: s.level, practiceStyle: s.style });
    if (state !== s || s.token !== token) return;
    s.kase = res;
    s.phase = "step";
    paintStep();
  } catch (e) {
    if (state !== s || s.token !== token) return;
    s.phase = "error";
    paintShell({
      ...shellBase(s),
      prompt: e.message || "Couldn't write a case.",
      promptClass: "ask",
      dock: `${secondaryBtn("clinical-retry", "Try again")}${primaryBtn("return-focus", "Back to the set")}`,
    });
  }
}

// --- One step ----------------------------------------------------------------------

const stepsOf = (s) => s.kase.steps;
const currentStep = (s) => stepsOf(s)[s.stepIdx];
const letter = (i) => String.fromCharCode(65 + i);
const showVerdicts = (s) => s.flags.checkpoints; // Learn concepts explains each step as it is answered

function vignetteHtml(s, clamped) {
  return `<div class="st-prompt text${clamped ? " st-clamp" : ""}" id="caseText">${esc(s.kase.vignette)}</div>`;
}

function optionsHtml(s, st) {
  const a = s.answers[st.id];
  const r = a?.result;
  return `<div class="st-opts" role="group" aria-label="${esc(st.question)}">${st.options.map((o, i) => {
    let cls = "";
    let tile = letter(i);
    if (a && r && showVerdicts(s)) {
      if (o.id === r.correctOptionId) { cls = " right"; tile = icon("check", 16, 3); }
      else if (o.id === a.answer) { cls = " wrong"; tile = icon("close", 14, 3); }
      else cls = " dim";
    } else if (a) cls = o.id === a.answer ? " sel" : " dim";
    else if (s.pick === o.id) cls = " sel";
    return `<button type="button" class="st-opt${cls}" data-action="clinical-pick" data-id="${esc(o.id)}"${a ? " disabled" : ""} aria-pressed="${s.pick === o.id || a?.answer === o.id}">
        <span class="key">${tile}</span><span class="txt">${esc(o.text)}</span></button>`;
  }).join("")}</div>`;
}

function findingsHtml(s, st) {
  const a = s.answers[st.id];
  const r = a?.result;
  return `<div class="st-chips st-mt16" role="group" aria-label="Findings in the case">${s.kase.findings.map((f) => {
    let cls = "";
    if (a && r && showVerdicts(s)) cls = (r.keyFindingIds || []).includes(f.id) ? " cov" : f.id === a.answer ? " amber" : "";
    else if (a || s.pick === f.id) cls = (a?.answer === f.id || s.pick === f.id) ? " on" : "";
    return `<button type="button" class="st-chip btn${cls}" data-action="clinical-finding" data-id="${esc(f.id)}"${a ? " disabled" : ""}>${esc(f.text)}</button>`;
  }).join("")}</div>`;
}

function verdictHtml(s, st) {
  const a = s.answers[st.id];
  const r = a?.result;
  if (!a) return "";
  if (a.skipped) return `<div class="st-mt16">${verdictRow("skip", "Skipped")}</div>`;
  if (!r || !showVerdicts(s)) return `<div class="st-note" role="status">Answer locked in. You'll see how it went at the end of the case.</div>`;
  const test = r.testResult;
  return `<div class="st-mt16" role="status">${verdictRow(VERDICT_KIND[r.verdict] || "no", VERDICT_LABEL[r.verdict] || "Not quite")}
      ${r.note ? `<div class="st-feedback">${esc(r.note)}</div>` : ""}
      ${r.explanation ? `<div class="st-feedback">${esc(r.explanation)}</div>` : ""}
      ${r.modelAnswer && r.verdict !== "correct" ? `<div class="st-feedback">Answer: ${esc(r.modelAnswer)}</div>` : ""}
      ${r.source === "general" ? `<div class="st-note">${GENERAL}</div>` : ""}
      ${test ? `<div class="st-label st-mt16">Result · ${esc(test.name)}</div><div class="st-text15 st-mt4">${esc(test.result)}</div>${test.source === "general" ? `<div class="st-note">${GENERAL}</div>` : ""}` : ""}
    </div>`;
}

function hintsHtml(s, st) {
  const n = s.hints[st.id] || 0;
  const used = st.hints.slice(0, n);
  const a = s.answers[st.id];
  const btn = n >= st.hints.length
    ? `<button type="button" class="st-link" disabled>${icon("bulb", 16)}No more hints</button>`
    : `<button type="button" class="st-link" data-action="clinical-hint"${a ? " hidden" : ""}>${icon("bulb", 16)}Get a hint</button>`;
  return `<div class="st-hintbar">${btn}</div>${used.map((h) => `<div class="st-feedback" style="margin-top:8px">${esc(h)}</div>`).join("")}`;
}

function paintStep() {
  const s = state;
  const st = currentStep(s);
  const a = s.answers[st.id];
  const n = stepsOf(s).length;
  const vignetteClamped = s.stepIdx > 0 || !!a;
  const answered = !!a;
  const last = s.stepIdx === n - 1;

  let input = "";
  let dock = "";
  if (st.kind === "choice") {
    input = optionsHtml(s, st);
    if (!answered && s.level === "intermediate") {
      input += `<label class="st-fieldlabel st-mt16"><span class="st-label">Why? (optional, one line)</span>
        <textarea id="clinicalWhy" class="st-field h48" maxlength="${MAX_ANSWER}" placeholder="Say why in a line" aria-label="Why">${esc(s.why || "")}</textarea></label>`;
    }
    if (!answered) dock = s.level === "intermediate" ? primaryBtn("clinical-check", "Check", `id="clinicalCheck"${s.pick ? "" : " disabled"}`) : `<div class="st-dock-note">Pick an answer, or press A–D</div>`;
  } else if (st.kind === "finding") {
    input = findingsHtml(s, st);
    if (!answered) dock = `<div class="st-dock-note">Tap the finding in the case that points to it most</div>`;
  } else {
    input = answered
      ? `<div class="st-field h72 static st-mt16">${esc(a.skipped ? "" : a.answer)}</div>`
      : `<textarea id="clinicalText" class="st-field h72 st-mt16" maxlength="${MAX_ANSWER}" placeholder="Answer in a line" aria-label="${esc(st.question)}">${esc(s.text || "")}</textarea>`;
    if (!answered) dock = `${st.optional ? secondaryBtn("clinical-skip", "Skip") : ""}${primaryBtn("clinical-check", "Check", 'id="clinicalCheck" disabled')}`;
  }
  if (answered) dock = primaryBtn("clinical-next", last ? "See case summary" : "Next step");

  paintShell({
    ...shellBase(s),
    hasProgress: s.caseIdx > 1 || s.stepIdx > 0 || answered,
    promptHtml: vignetteHtml(s, vignetteClamped),
    body: `
      ${vignetteClamped ? `<button type="button" class="st-link st-mt6" id="caseToggle" data-action="clinical-toggle-full-case">Show full case</button>` : ""}
      <div class="st-label st-mt24">Step ${s.stepIdx + 1} of ${n}${st.optional ? " · optional" : ""}</div>
      <div class="st-q">${esc(st.question)}</div>
      ${input}
      ${hintsHtml(s, st)}
      ${verdictHtml(s, st)}`,
    dock,
    keys: (e) => {
      if (answered) {
        if (e.key === "Enter" && !typing(e)) { e.preventDefault(); clinicalCaseAction("next"); }
        return;
      }
      if (metaEnter(e)) { e.preventDefault(); clinicalCaseAction("check"); return; }
      if (typing(e) || e.ctrlKey || e.metaKey) return;
      const i = e.key.length === 1 ? e.key.toUpperCase().charCodeAt(0) - 65 : -1;
      if (st.kind === "choice" && st.options[i]) { e.preventDefault(); clinicalCaseAction("pick", st.options[i].id); }
    },
  });

  const text = /** @type {HTMLTextAreaElement|null} */ (document.getElementById("clinicalText"));
  if (text) {
    bindField(text, { btn: /** @type {HTMLButtonElement} */ (document.getElementById("clinicalCheck")), onChange: (v) => { s.text = v; }, onSubmit: () => clinicalCaseAction("check") });
    if (!s.hints[st.id]) focusEnd(text);
  }
  const why = /** @type {HTMLTextAreaElement|null} */ (document.getElementById("clinicalWhy"));
  if (why) bindField(why, { onChange: (v) => { s.why = v; }, onSubmit: () => clinicalCaseAction("check") });
}

export function clinicalCaseAction(action, payload) {
  const s = state;
  if (!s) return;
  if (action === "retry") return fetchCase();
  if (action === "toggle-full-case") {
    const el = document.getElementById("caseText");
    const btn = document.getElementById("caseToggle");
    if (!el || !btn) return;
    btn.textContent = el.classList.toggle("st-clamp") ? "Show full case" : "Hide full case";
    return;
  }
  if (action === "level-up") return levelUp();
  if (s.phase !== "step") {
    if (action === "next" && s.phase === "summary") return nextCase();
    return;
  }
  const st = currentStep(s);
  if (s.busy) return;
  if (action === "hint") {
    if ((s.hints[st.id] || 0) >= st.hints.length) return;
    s.hints[st.id] = (s.hints[st.id] || 0) + 1;
    s.hintCount++;
    s.text = (/** @type {HTMLTextAreaElement|null} */ (document.getElementById("clinicalText"))?.value) ?? s.text;
    paintStep();
  } else if (action === "pick" && st.kind === "choice" && !s.answers[st.id]) {
    if (s.level === "intermediate") {
      s.pick = payload;
      paintStep();
    } else answerStep(st, payload);
  } else if (action === "finding" && st.kind === "finding" && !s.answers[st.id]) {
    answerStep(st, payload);
  } else if (action === "check" && !s.answers[st.id]) {
    if (st.kind === "choice") { if (s.pick) answerStep(st, s.pick, (s.why || "").trim()); }
    else if (st.kind === "short") {
      const v = (/** @type {HTMLTextAreaElement|null} */ (document.getElementById("clinicalText"))?.value || "").trim();
      if (v) answerStep(st, v.slice(0, MAX_ANSWER));
    }
  } else if (action === "skip" && st.optional) {
    s.answers[st.id] = { skipped: true };
    advance();
  } else if (action === "next" && s.answers[st.id]) advance();
}

/** Check one step. Choices and findings are checked at once (no model call); typed answers wait for the end in Interview simulation. */
async function answerStep(st, answer, why = "") {
  const s = state;
  if (st.kind === "short" && !showVerdicts(s)) {
    s.answers[st.id] = { answer, why, result: null };
    s.text = "";
    return advance();
  }
  s.busy = true;
  const buttons = app.querySelectorAll(".st-dock button, .st-opt, .st-chip.btn");
  buttons.forEach((b) => { /** @type {HTMLButtonElement} */ (b).disabled = true; });
  try {
    const res = await send({
      type: "CLINICAL_CHECK", state: s.kase.state, answers: [{ stepId: st.id, answer, ...(why ? { why } : {}) }],
      ordered: s.ordered, practiceStyle: s.style,
    });
    if (state !== s) return;
    record(res);
    s.answers[st.id] = { answer, why, result: res.results[0] };
    s.text = "";
    s.pick = null;
    s.why = "";
    s.busy = false;
    if (showVerdicts(s)) paintStep();
    else advance();
  } catch (e) {
    if (state !== s) return;
    s.busy = false;
    toast(e.message || "Couldn't check that. Try again.");
    paintStep(); // the pick and the typed text are still in state
  }
}

function record(res) {
  const s = state;
  for (const r of res.results || []) if (r.testResult && !s.ordered.includes(r.testResult.name)) s.ordered.push(r.testResult.name);
  if (res.caseDone) { s.done = true; s.other = res.otherResults || []; }
}

function advance() {
  const s = state;
  s.busy = false;
  s.pick = null;
  s.why = "";
  if (s.stepIdx < stepsOf(s).length - 1) {
    s.stepIdx++;
    return paintStep();
  }
  finishCase();
}

/** The last step is answered: grade held-back typed answers in one call, collect the other results, and show the summary. */
async function finishCase() {
  const s = state;
  s.phase = "grading";
  const held = stepsOf(s).filter((st) => st.kind === "short" && s.answers[st.id] && !s.answers[st.id].skipped && !s.answers[st.id].result)
    .map((st) => ({ stepId: st.id, answer: s.answers[st.id].answer }));
  const needsCall = held.length || !s.done;
  if (needsCall) {
    paintShell({ ...shellBase(s), body: waitRow(held.length ? "Checking your answers…" : "Finishing the case…") });
    try {
      const res = await send({ type: "CLINICAL_CHECK", state: s.kase.state, answers: held, finish: true, ordered: s.ordered, practiceStyle: s.style });
      if (state !== s) return;
      for (const r of res.results || []) s.answers[r.stepId] = { ...s.answers[r.stepId], result: r };
      record(res);
      s.done = true;
    } catch (e) {
      if (state !== s) return;
      if (held.length) {
        s.phase = "step";
        toast(e.message || "Couldn't check your answers. Try again.");
        return paintStep();
      }
      // Only the extra results are missing; the case itself is complete.
    }
  }
  await saveCase();
  s.phase = "summary";
  paintSummary();
}

// --- Case summary ---------------------------------------------------------------------

function caseScore(s) {
  const counted = stepsOf(s).filter((st) => !s.answers[st.id]?.skipped);
  if (!counted.length) return 0;
  return counted.reduce((n, st) => n + (VERDICT_SCORE[s.answers[st.id]?.result?.verdict] ?? 0), 0) / counted.length;
}

async function saveCase() {
  const s = state;
  const score = caseScore(s);
  s.caseScores.push(score);
  for (const st of stepsOf(s)) {
    const r = s.answers[st.id]?.result;
    if (!r) continue;
    const t = (s.areaTally[st.area] ||= { right: 0, total: 0 });
    t.total++;
    t.right += VERDICT_SCORE[r.verdict] ?? 0;
    // A missed or partly right step becomes a candidate review card (the learner chooses which to keep).
    if (r.verdict !== "correct") {
      const key = r.modelAnswer || r.explanation || "";
      s.gaps.push({ type: "missed_rubric", text: `${st.question}${key ? ` ${key}` : ""}`.slice(0, 400) });
    }
  }
  s.logId = uid();
  const now = Date.now();
  await Promise.all([
    bumpActivity(1),
    appendReviewLog(drillLogEntry({
      kind: "clinical", sessionId: s.sessionId, fraction: score, id: s.logId,
      meta: {
        practiceStyle: s.style, mode: "clinical_case", level: s.level, score, startedAt: new Date(s.startedAt).toISOString(),
        completedAt: new Date(now).toISOString(), durationMs: now - s.startedAt, usedHint: s.hintCount > 0, hintCount: s.hintCount,
      },
    })),
  ]).catch(() => {});
}

async function stepUpFor(s) {
  const rows = (await getReviewLog().catch(() => [])).filter((r) => r.kind === "clinical" && r.sessionId === s.sessionId && r.level === s.level && typeof r.score === "number");
  rows.sort((a, b) => String(a.reviewedAt).localeCompare(String(b.reviewedAt)));
  return suggestStepUp(rows.map((r) => r.score), s.level);
}

async function levelUp() {
  const s = state;
  const to = nextLevel(s.level);
  await setLevel(s.sessionId, to);
  toast(`${levelLabel(to)} next time.`);
  document.getElementById("levelUpNote")?.setAttribute("hidden", "");
}

function testsBlock(s) {
  const chosen = [];
  for (const st of stepsOf(s)) {
    const t = s.answers[st.id]?.result?.testResult;
    if (t) chosen.push(t);
  }
  const row = (t, tag) => `<div class="st-li"><div class="nm">${esc(t.name)}${tag ? ` <span class="st-tag">${tag}</span>` : ""}</div><div class="rs">${esc(t.result)}</div>${t.source === "general" ? `<div class="st-note">${GENERAL}</div>` : ""}</div>`;
  if (!chosen.length && !s.other.length) return "";
  return `<div class="st-label st-mt24">Results</div>
    <div class="st-list">${chosen.map((t) => row(t, "Ordered")).join("")}</div>
    ${s.other.length ? `<div class="st-label st-mt16">Other results</div><div class="st-list">${s.other.map((t) => row(t, "Not ordered")).join("")}</div>` : ""}`;
}

function paintSummary() {
  const s = state;
  const lastCase = s.caseIdx >= CASES;
  const rows = stepsOf(s).map((st) => {
    const a = s.answers[st.id];
    const r = a?.result;
    const title = AREA_NAME[st.area] || "Step";
    if (!a || a.skipped) return `<div class="st-li roomy">${verdictRow("skip", `${title} · Skipped`)}</div>`;
    const kind = VERDICT_KIND[r?.verdict] || "skip";
    return `<div class="st-li roomy">${verdictRow(kind, `${title} · ${VERDICT_LABEL[r?.verdict] || "Not checked"}`)}
        ${a.why ? `<div class="st-feedback">Your reasoning: ${esc(a.why)}</div>` : ""}
        ${r?.note ? `<div class="st-feedback">${esc(r.note)}</div>` : ""}
        ${r?.explanation ? `<div class="st-feedback">${esc(r.explanation)}</div>` : ""}
        ${r?.modelAnswer && r.verdict !== "correct" ? `<div class="st-feedback">Answer: ${esc(r.modelAnswer)}</div>` : ""}
        ${r?.source === "general" ? `<div class="st-note">${GENERAL}</div>` : ""}
      </div>`;
  }).join("");
  const score = caseScore(s);
  paintShell({
    ...shellBase(s),
    progress: (s.caseIdx / CASES) * 100,
    hasProgress: true,
    promptHtml: vignetteHtml(s, true),
    body: `
      <button type="button" class="st-link st-mt6" id="caseToggle" data-action="clinical-toggle-full-case">Show full case</button>
      <div class="st-label st-mt24">How it went · ${Math.round(score * 100)}%</div>
      <div class="st-list">${rows}</div>
      ${testsBlock(s)}`,
    dock: primaryBtn("clinical-next", lastCase ? "Finish" : "Next case"),
    keys: (e) => { if (e.key === "Enter" && !typing(e)) { e.preventDefault(); clinicalCaseAction("next"); } },
  });
}

function nextCase() {
  const s = state;
  if (s.caseIdx >= CASES) return paintSessionEnd();
  s.caseIdx++;
  fetchCase();
}

// --- End of the session ------------------------------------------------------------------

async function paintSessionEnd() {
  const s = state;
  s.phase = "end";
  const n = s.caseScores.length;
  const avg = n ? s.caseScores.reduce((a, b) => a + b, 0) / n : 0;
  const areas = Object.entries(s.areaTally).filter(([, t]) => t.total >= 1).map(([area, t]) => ({ area, rate: t.right / t.total, t }));
  areas.sort((a, b) => b.rate - a.rate);
  const best = areas[0];
  const worst = areas.length > 1 && areas[areas.length - 1].rate < areas[0].rate ? areas[areas.length - 1] : null;
  const fmt = (x) => (Number.isInteger(x) ? String(x) : x.toFixed(1));
  const up = await stepUpFor(s);
  paintShell({
    mode: modeLabel(s),
    prompt: "Session complete",
    promptClass: "ask",
    progress: 100,
    counter: `${CASES} / ${CASES}`,
    body: `
      <div class="st-mt16">${feedbackSummary({
        strongest: best && best.rate >= 0.5 ? `${AREA_NAME[best.area]}: ${fmt(best.t.right)} of ${best.t.total} right` : "",
        gap: worst ? `${AREA_NAME[worst.area]} needs work: ${fmt(worst.t.right)} of ${worst.t.total} right` : "",
        scoreLine: `Average ${Math.round(avg * 100)}% over ${n} case${n === 1 ? "" : "s"}`,
      })}</div>
      ${up ? `<div class="st-mt20" id="levelUpNote"><div class="st-text15">Two strong cases in a row. Try ${esc(levelLabel(up))} next time?</div>
        <button type="button" class="st-link st-mt8" data-action="clinical-level-up">Use ${esc(levelLabel(up))}</button></div>` : ""}
      ${s.gaps.length ? reviewCardsAction() : ""}`,
    dock: primaryBtn("return-focus", "Done"),
  });
  setReviewCards(() => {
    offerReviewCards({
      sessionId: s.sessionId, mode: "clinical", gaps: s.gaps.slice(0, 8), topic: s.topic, practiceStyle: s.style,
      onSaved: (ids) => { if (s.logId) annotateReviewLog(s.logId, { savedSuggestedCardIds: ids }).catch(() => {}); },
    });
  });
}
