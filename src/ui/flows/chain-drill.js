import { app, bundle, esc, setFor, send, toast } from "../core.js";
import { appendReviewLog, bumpActivity, updateCard } from "../../storage/store.js";
import { orderedSteps } from "../../storage/chains.js";
import { showChrome } from "../nav.js";
import { failedLinkIds, pickDrillChain, roundScore } from "../../storage/chain-drill.js";
import { drillLogEntry } from "../../storage/drill-log.js";
import { review } from "../../../shared/srs.js";
import { goReturn, setFocusReturn } from "./review.js";
import { bindField, focusEnd, icon, paintShell, primaryBtn, secondaryBtn, verdictRow } from "./shell.js";

// Chain drill, working backwards: the effect is given at the bottom of a
// vertical chain and the learner supplies the cause above it, one step at a
// time. Solved steps stay on the rail, showing the mechanism being rebuilt.
let cSetId = null;
let cSetName = "";
let cChain = null;
let cSteps = [];
let state = null; // { currentIdx, status: "answering" | "checking" | "checked", inputText, result }

export async function startChainDrill(sessionId) {
  const { sessions, studySets, reviewLog } = await bundle();
  const set = setFor(sessionId, studySets);
  if (!set || !set.chains) return;

  const chain = pickDrillChain(set.chains, reviewLog, sessionId);
  if (!chain) return toast("Fill in at least two steps of a chain to drill it.");

  const steps = orderedSteps(chain).filter((s) => s.step && s.step.statement);
  if (steps.length < 2) return toast("Not enough filled steps in this chain.");

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
  };
  setFocusReturn("set:" + sessionId);
  showChrome(false);
  app.dataset.drillFlow = "active";
  renderDrill();
}

export function chainDrillAction(action) {
  if (action === "check") checkAnswer();
  else if (action === "dontknow") checkAnswer(true);
  else if (action === "next") nextStep();
  else if (action === "finish") finishDrill();
}

const dotSolved = () => `<div class="st-dot solved">${icon("check", 10, 4)}</div>`;

function row(dot, cell, last, attrs = "") {
  return `<div class="st-row${last ? " last" : ""}"${attrs}>
      <div class="st-rail-col">${dot}${last ? "" : '<div class="st-line"></div>'}</div>
      <div class="st-cell">${cell}</div>
    </div>`;
}

function currentNode() {
  if (state.status !== "checked") {
    return row(`<div class="st-dot cur"></div>`, `
      <div class="st-label" style="color:var(--accent-text)">Your answer</div>
      <textarea id="chainInput" class="st-field h96 st-mt8" placeholder="What happens right before this?" aria-label="Your answer">${esc(state.inputText)}</textarea>`, false, ' id="chainCur"');
  }
  const r = state.result;
  const target = cSteps[state.currentIdx];
  if (r.dontknow) {
    return row(`<div class="st-dot cur amber"></div>`, `
      <div class="st-label" style="color:var(--st-amber-text)">Missed</div>
      <div class="st-field h96 static amber st-mt8">${esc(target.step.statement)}</div>`, false, ' id="chainCur"');
  }
  return row(r.correct ? dotSolved() : `<div class="st-dot cur amber"></div>`, `
    <div class="st-label" style="color:${r.correct ? "var(--accent-text)" : "var(--st-amber-text)"}">Your answer</div>
    <div class="st-field h96 static ${r.correct ? "ok" : "amber"} st-mt8">${esc(state.inputText)}</div>
    <div class="st-mt4">${verdictRow(r.correct ? "ok" : "no", r.correct ? "Correct" : "Not quite")}</div>
    ${r.feedback ? `<div class="st-feedback">${esc(r.feedback)}</div>` : ""}`, false, ' id="chainCur"');
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
  paintShell({
    mode: `Chain drill${cSetName ? ` · ${cSetName}` : ""}`,
    prompt: "What directly causes the step below?",
    promptClass: "q",
    progress: (solved / total) * 100,
    counter: `${solved} / ${total}`,
    hasProgress: solved > 0 || state.status === "checked",
    body: `<div class="st-rail st-mt24">${rows}</div>`,
    dock: answering
      ? `${secondaryBtn("chain-dontknow", "Don't know")}${primaryBtn("chain-check", "Check", 'id="chainCheck" disabled')}`
      : primaryBtn(finishing ? "chain-finish" : "chain-next", finishing ? "Finish" : "Next step"),
    keys: answering ? null : (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      chainDrillAction(finishing ? "finish" : "next");
    },
  });

  if (answering) {
    const box = /** @type {HTMLTextAreaElement} */ (document.getElementById("chainInput"));
    bindField(box, { btn: /** @type {HTMLButtonElement} */ (document.getElementById("chainCheck")), onSubmit: () => checkAnswer() });
    focusEnd(box);
  }
}

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
  const input = dontknow ? "" : (inputEl?.value.trim() || "");
  if (!dontknow && !input) return;

  const idx = state.currentIdx;
  state.inputText = input;
  if (dontknow) {
    cSteps[idx].failed = true;
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
    if (!res.grading.correct) cSteps[idx].failed = true;
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

function finishDrill() {
  if (!state || state.status !== "checked") return;
  const failedLinks = failedLinkIds(cChain, cSteps);
  if (failedLinks && failedLinks.length > 0) {
    penalizeLinks(failedLinks).catch(console.error);
  }

  bumpActivity(1).catch(() => {});
  // Through drillLogEntry: a row without a grade, or with an empty cardId,
  // fails validation for the whole sync batch (server/src/schema.ts).
  appendReviewLog(drillLogEntry({
    kind: "chain-drill",
    sessionId: cSetId,
    chainId: cChain.id,
    fraction: roundScore(cSteps),
    id: `cd-${Date.now()}`,
  })).catch(() => {});
  state = null;
  goReturn();
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
