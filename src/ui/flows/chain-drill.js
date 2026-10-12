import { app, bundle, esc, setFor, send, toast } from "../core.js";
import { annotateReviewLog, appendReviewLog, bumpActivity, getReviewLog, updateCard } from "../../storage/store.js";
import { liveChains, orderedSteps } from "../../storage/chains.js";
import { showChrome } from "../nav.js";
import { failedLinkIds, pickDrillChain, roundScore } from "../../storage/chain-drill.js";
import { drillLogEntry } from "../../storage/drill-log.js";
import { chainHints, pickChainOptions, trimChain } from "../../storage/chain-options.js";
import { levelFlags, levelLabel, nextLevel, suggestStepUp } from "../../storage/practice-level.js";
import { levelFor, setLevel } from "../practice-ui.js";
import { review } from "../../../shared/srs.js";
import { goReturn, setFocusReturn } from "./review.js";
import { bindField, feedbackSummary, focusEnd, icon, offerReviewCards, paintShell, primaryBtn, reviewCardsAction, secondaryBtn, setReviewCards, typing, verdictRow } from "./shell.js";

// Chain drill, working backwards: the effect is given at the bottom of a
// vertical chain and the learner supplies the cause above it, one step at a
// time. Solved steps stay on the rail, showing the mechanism being rebuilt.
// The level (docs/prompts/39) sets how long the chain is and how you answer:
// Beginner picks from four options taken from your other chains (no model
// call), Intermediate and Advanced type one short line. Hints are free.
const MAX_ANSWER = 200;
let cSetId = null;
let cSetName = "";
let cChain = null;
let cSteps = [];
// { currentIdx, status: "answering" | "checking" | "checked" | "done", inputText, result, level, flags, options, hints, seed, startedAt, hintCount, logId, gaps }
let state = null;

export async function startChainDrill(sessionId) {
  const { sessions, studySets, reviewLog } = await bundle();
  const set = setFor(sessionId, studySets);
  if (!set || !set.chains) return;

  const chain = pickDrillChain(set.chains, reviewLog, sessionId);
  if (!chain) return toast("Fill in at least two steps of a chain to drill it.");

  const level = await levelFor(sessionId);
  const flags = levelFlags(level);
  const filled = (c) => orderedSteps(c).filter((s) => s.step && s.step.statement);
  const all = filled(chain);
  if (all.length < 2) return toast("Not enough filled steps in this chain.");
  const steps = trimChain(all, flags.chainLength);

  cSetId = sessionId;
  cSetName = String(sessions.find((s) => s.id === sessionId)?.title || set.title || "").slice(0, 80);
  cChain = chain;
  cSteps = steps;
  cSteps.forEach((s) => { s.failed = false; });
  state = {
    currentIdx: cSteps.length - 2, // the last step is given; start just above it
    status: "answering",
    inputText: "",
    result: null,
    level,
    flags,
    fullChain: { id: chain.id, steps: all },
    others: liveChains(set.chains).filter((c) => c.id !== chain.id).map((c) => ({ id: c.id, steps: filled(c) })),
    options: {},
    hints: {},
    seed: Date.now() % 1_000_000,
    startedAt: Date.now(),
    hintCount: 0,
    logId: null,
    gaps: [],
  };
  setFocusReturn("set:" + sessionId);
  showChrome(false);
  app.dataset.drillFlow = "active";
  renderDrill();
}

export function chainDrillAction(action, payload) {
  if (action === "check") checkAnswer();
  else if (action === "dontknow") checkAnswer(true);
  else if (action === "pick") pickOption(payload);
  else if (action === "hint") showHint();
  else if (action === "next") nextStep();
  else if (action === "finish") finishDrill();
  else if (action === "level-up") levelUp();
}

const dotSolved = () => `<div class="st-dot solved">${icon("check", 10, 4)}</div>`;

function row(dot, cell, last, attrs = "") {
  return `<div class="st-row${last ? " last" : ""}"${attrs}>
      <div class="st-rail-col">${dot}${last ? "" : '<div class="st-line"></div>'}</div>
      <div class="st-cell">${cell}</div>
    </div>`;
}

/** The four options for the step being asked, made once per step so a repaint doesn't reshuffle them. */
function optionsFor(idx) {
  if (!(idx in state.options)) {
    state.options[idx] = state.flags.chainAnswers === "choice"
      ? pickChainOptions({ target: cSteps[idx], chain: state.fullChain, otherChains: state.others, seed: state.seed + idx * 7 })
      : null;
  }
  return state.options[idx]; // null: too few different wrong answers, so this step is typed
}

function hintsHtml(idx) {
  const hints = chainHints(cSteps, idx);
  const n = state.hints[idx] || 0;
  const btn = n >= hints.length
    ? `<button type="button" class="st-link" disabled>${icon("bulb", 16)}No more hints</button>`
    : `<button type="button" class="st-link" data-action="chain-hint">${icon("bulb", 16)}Get a hint</button>`;
  return `<div class="st-hintbar">${btn}</div>${hints.slice(0, n).map((h) => `<div class="st-feedback" style="margin-top:8px">${esc(h)}</div>`).join("")}`;
}

function currentNode() {
  if (state.status !== "checked") {
    const opts = optionsFor(state.currentIdx);
    const input = opts
      ? `<div class="st-opts st-mt8" role="group" aria-label="Pick the step">${opts.options.map((o, i) => `
          <button type="button" class="st-opt" data-action="chain-pick" data-id="${esc(o.id)}"><span class="key">${String.fromCharCode(65 + i)}</span><span class="txt">${esc(o.text)}</span></button>`).join("")}</div>`
      : `<textarea id="chainInput" class="st-field h72 st-mt8" maxlength="${MAX_ANSWER}" placeholder="What happens right before this?" aria-label="Your answer">${esc(state.inputText)}</textarea>`;
    return row(`<div class="st-dot cur"></div>`, `
      <div class="st-label" style="color:var(--accent-text)">Your answer</div>
      ${input}
      ${hintsHtml(state.currentIdx)}`, false, ' id="chainCur"');
  }
  const r = state.result;
  const target = cSteps[state.currentIdx];
  if (r.dontknow) {
    return row(`<div class="st-dot cur amber"></div>`, `
      <div class="st-label" style="color:var(--st-amber-text)">Missed</div>
      <div class="st-field h72 static amber st-mt8">${esc(target.step.statement)}</div>`, false, ' id="chainCur"');
  }
  return row(r.correct ? dotSolved() : `<div class="st-dot cur amber"></div>`, `
    <div class="st-label" style="color:${r.correct ? "var(--accent-text)" : "var(--st-amber-text)"}">Your answer</div>
    <div class="st-field h72 static ${r.correct ? "ok" : "amber"} st-mt8">${esc(state.inputText)}</div>
    <div class="st-mt4">${verdictRow(r.correct ? "ok" : "no", r.correct ? "Correct" : "Not quite")}</div>
    ${r.feedback ? `<div class="st-feedback">${esc(r.feedback)}</div>` : ""}
    ${r.picked && !r.correct ? `<div class="st-feedback">Answer: ${esc(target.step.statement)}</div>` : ""}`, false, ' id="chainCur"');
}

function renderDrill() {
  const last = cSteps.length - 1;
  const total = last;
  const solved = last - 1 - state.currentIdx + (state.status === "checked" && state.result?.correct ? 1 : 0);

  let rows = "";
  for (let i = state.currentIdx; i <= last; i++) {
    const s = cSteps[i];
    if (i === state.currentIdx) rows += currentNode();
    else if (i < last) {
      rows += row(dotSolved(), `
        <div class="st-label">Step ${i + 1}</div>
        <div class="st-step">${esc(s.step.statement)}</div>`, false);
    } else {
      rows += row(`<div class="st-dot given"></div>`, `
        <div class="st-label">${esc(s.label)}</div>
        <div class="st-step given">${esc(s.step.statement)}</div>`, true);
    }
  }

  const answering = state.status !== "checked";
  const finishing = state.currentIdx === 0;
  const picking = answering && !!optionsFor(state.currentIdx);
  paintShell({
    mode: `Chain drill${cSetName ? ` · ${cSetName}` : ""} · ${levelLabel(state.level)}`,
    prompt: "What directly causes the step below?",
    promptClass: "q",
    progress: (solved / total) * 100,
    counter: `${solved} / ${total}`,
    hasProgress: solved > 0 || state.status === "checked",
    body: `<div class="st-rail st-mt24">${rows}</div>`,
    dock: answering
      ? (picking ? secondaryBtn("chain-dontknow", "Don't know") : `${secondaryBtn("chain-dontknow", "Don't know")}${primaryBtn("chain-check", "Check", 'id="chainCheck" disabled')}`)
      : primaryBtn(finishing ? "chain-finish" : "chain-next", finishing ? "Finish" : "Next step"),
    keys: (e) => {
      if (!answering) {
        if (e.key !== "Enter") return;
        e.preventDefault();
        chainDrillAction(finishing ? "finish" : "next");
        return;
      }
      if (picking && !typing(e) && !e.ctrlKey && !e.metaKey && e.key.length === 1) {
        const o = optionsFor(state.currentIdx).options[e.key.toUpperCase().charCodeAt(0) - 65];
        if (o) { e.preventDefault(); chainDrillAction("pick", o.id); }
      }
    },
  });

  if (answering && !picking) {
    const box = /** @type {HTMLTextAreaElement} */ (document.getElementById("chainInput"));
    // Cmd/Ctrl+Enter checks, through bindField.
    bindField(box, { btn: /** @type {HTMLButtonElement} */ (document.getElementById("chainCheck")), onChange: (v) => { state.inputText = v; }, onSubmit: () => checkAnswer() });
    if (!state.hints[state.currentIdx]) focusEnd(box);
  }
}

function showHint() {
  if (!state || state.status !== "answering") return;
  const idx = state.currentIdx;
  if ((state.hints[idx] || 0) >= chainHints(cSteps, idx).length) return;
  state.hints[idx] = (state.hints[idx] || 0) + 1;
  state.hintCount++;
  const box = /** @type {HTMLTextAreaElement|null} */ (document.getElementById("chainInput"));
  if (box) state.inputText = box.value; // a hint repaints; the typed line stays
  renderDrill();
}

/** Beginner: a tapped option is checked on the device, with no model call. */
function pickOption(optionId) {
  if (!state || state.status !== "answering") return;
  const idx = state.currentIdx;
  const opts = optionsFor(idx);
  const chosen = opts?.options.find((o) => o.id === optionId);
  if (!chosen) return;
  const correct = optionId === opts.correctId;
  state.inputText = chosen.text;
  if (!correct) { cSteps[idx].failed = true; noteGap(idx); }
  state.result = { correct, picked: true };
  state.status = "checked";
  renderDrill();
}

const noteGap = (idx) => {
  const s = cSteps[idx];
  state.gaps.push({ type: "missed_rubric", text: `${s.label}: ${s.step.statement}`.slice(0, 400) });
};

/** After Next step: put the new Current node under the prompt when the chain has grown past the screen. */
function scrollToCurrent() {
  const body = document.getElementById("stBody");
  const cur = document.getElementById("chainCur");
  const prompt = body?.querySelector(".st-prompt");
  if (!body || !cur || !prompt) return;
  const b = body.getBoundingClientRect();
  if (cur.getBoundingClientRect().bottom <= b.bottom - 8) return;
  const gap = cur.getBoundingClientRect().top - prompt.getBoundingClientRect().bottom;
  body.scrollTop += gap - 16;
}

async function checkAnswer(dontknow = false) {
  if (!state || state.status !== "answering") return;
  const inputEl = /** @type {HTMLTextAreaElement|null} */ (document.getElementById("chainInput"));
  const input = dontknow ? "" : (inputEl?.value.trim() || "").slice(0, MAX_ANSWER);
  if (!dontknow && !input) return;

  const idx = state.currentIdx;
  state.inputText = input;
  if (dontknow) {
    cSteps[idx].failed = true;
    noteGap(idx);
    state.result = { dontknow: true, correct: false };
    state.status = "checked";
    return renderDrill();
  }

  state.status = "checking";
  document.querySelectorAll(".st-dock button").forEach((b) => { /** @type {HTMLButtonElement} */ (b).disabled = true; });
  const btn = document.getElementById("chainCheck");
  if (btn) btn.textContent = "Checking…";
  try {
    const target = cSteps[idx];
    const prev = idx > 0 ? cSteps[idx - 1].step.statement : "None";
    const next = cSteps[idx + 1].step.statement;
    const q = `In a medical mechanism chain, what is the ${target.label} step? The previous step is "${prev}" and the next step is "${next}".`;
    const res = await send({ type: "GRADE_ANSWER", question: q, reference: target.step.statement, answer: input });
    if (!state || state.currentIdx !== idx || state.status !== "checking") return;
    state.result = { correct: !!res.grading.correct, feedback: res.grading.feedback };
    if (!res.grading.correct) { cSteps[idx].failed = true; noteGap(idx); }
    state.status = "checked";
    renderDrill();
  } catch (e) {
    if (!state || state.status !== "checking") return;
    state.status = "answering";
    renderDrill();
    toast(e.message);
  }
}

function nextStep() {
  if (!state || state.status !== "checked" || state.currentIdx <= 0) return;
  state.currentIdx--;
  state.status = "answering";
  state.inputText = "";
  state.result = null;
  renderDrill();
  scrollToCurrent();
}

async function finishDrill() {
  if (!state || state.status !== "checked") return;
  state.status = "done";
  const failedLinks = failedLinkIds(cChain, cSteps);
  if (failedLinks && failedLinks.length > 0) {
    penalizeLinks(failedLinks).catch(console.error);
  }

  const score = roundScore(cSteps);
  state.logId = `cd-${Date.now()}`;
  const now = Date.now();
  bumpActivity(1).catch(() => {});
  // Through drillLogEntry: a row without a grade, or with an empty cardId,
  // fails validation for the whole sync batch (server/src/schema.ts).
  await appendReviewLog(drillLogEntry({
    kind: "chain-drill",
    sessionId: cSetId,
    chainId: cChain.id,
    fraction: score,
    id: state.logId,
    meta: {
      mode: "chain_drill", level: state.level, score, startedAt: new Date(state.startedAt).toISOString(), completedAt: new Date(now).toISOString(),
      durationMs: now - state.startedAt, usedHint: state.hintCount > 0, hintCount: state.hintCount,
    },
  })).catch(() => {});
  paintEnd(score);
}

async function stepUp() {
  const rows = (await getReviewLog().catch(() => [])).filter((r) => r.kind === "chain-drill" && r.sessionId === cSetId && r.level === state.level && typeof r.score === "number");
  rows.sort((a, b) => String(a.reviewedAt).localeCompare(String(b.reviewedAt)));
  return suggestStepUp(rows.map((r) => r.score), state.level);
}

async function levelUp() {
  const to = nextLevel(state.level);
  await setLevel(cSetId, to);
  toast(`${levelLabel(to)} next time.`);
  document.getElementById("levelUpNote")?.setAttribute("hidden", "");
}

/** The chain as rebuilt: each step with how it went, then the level suggestion and review cards. */
async function paintEnd(score) {
  const s = state;
  const rebuilt = cSteps.slice(0, cSteps.length - 1);
  const missed = rebuilt.filter((x) => x.failed).length;
  const up = await stepUp();
  const rows = rebuilt.map((x) => `<div class="st-li roomy">${verdictRow(x.failed ? "no" : "ok", `${x.label} · ${x.failed ? "Missed" : "Got it"}`)}<div class="st-feedback">${esc(x.step.statement)}</div></div>`).join("");
  paintShell({
    mode: `Chain drill${cSetName ? ` · ${cSetName}` : ""} · ${levelLabel(s.level)}`,
    prompt: "Chain rebuilt",
    promptClass: "ask",
    progress: 100,
    counter: `${rebuilt.length} / ${rebuilt.length}`,
    body: `
      <div class="st-mt16">${feedbackSummary({
        strongest: missed < rebuilt.length ? `${rebuilt.length - missed} of ${rebuilt.length} steps right` : "",
        gap: missed ? `${missed} step${missed === 1 ? "" : "s"} to revisit: they will come back sooner in review` : "",
        scoreLine: `Score ${Math.round(score * 100)}%`,
      })}</div>
      <div class="st-label st-mt24">Your chain</div>
      <div class="st-list">${rows}</div>
      ${up ? `<div class="st-mt20" id="levelUpNote"><div class="st-text15">Two strong rounds in a row. Try ${esc(levelLabel(up))} next time?</div>
        <button type="button" class="st-link st-mt8" data-action="chain-level-up">Use ${esc(levelLabel(up))}</button></div>` : ""}
      ${s.gaps.length ? reviewCardsAction() : ""}`,
    dock: primaryBtn("return-focus", "Done"),
  });
  setReviewCards(() => offerReviewCards({
    sessionId: cSetId, mode: "clinical", gaps: s.gaps.slice(0, 8), topic: cSetName || "Medicine", practiceStyle: undefined,
    onSaved: (ids) => { if (s.logId) annotateReviewLog(s.logId, { savedSuggestedCardIds: ids }).catch(() => {}); },
  }));
}

async function penalizeLinks(linkIds) {
  const { studySets } = await bundle();
  const set = setFor(cSetId, studySets);
  if (!set) return;
  for (const linkId of linkIds) {
    const card = set.flashcards?.find((c) => c.id === linkId);
    if (card) {
      const upd = review(card, 0, Date.now(), set.examDate);
      Object.assign(card, upd);
      await updateCard(cSetId, card.id, upd);
    }
  }
}
