import { getDefaultPracticeStyle } from "../../storage/practice-style.js";
import { app, bundle, esc, send, setFor, toast } from "../core.js";
import { goReturn, setFocusReturn } from "./review.js";
import { showChrome } from "../nav.js";
import { appendReviewLog, bumpActivity, uid } from "../../storage/store.js";
import { drillLogEntry } from "../../storage/drill-log.js";
import { bindField, feedbackSummary, openSuggestionSheet, focusEnd, icon, paintShell, primaryBtn, verdictRow, waitRow } from "./shell.js";

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
  const style = set?.practiceStyle || await getDefaultPracticeStyle() || "guided";

  bottleneckState = {
    sessionId,
    practiceStyle: style,
    topic: String(session?.title || set?.title || "this topic").slice(0, 200),
    cards: cards.map((c) => ({ front: c.front, back: c.back })),
    task: null,
    hint: null,
    result: null,
    step: "generating",
    usedHint: false,
    draft: "",
    draft2: "",
    draft3: "",
    guidedStep: 1,
    selectedComponentIdx: -1,
    selectedComponentId: null,
    hints: [],
    hintLevel: 0,
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
    const res = await send({ type: "BOTTLENECK_TASK", concept: s.topic, reference: s.cards, practiceStyle: s.practiceStyle });
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
  
  const isSim = s.task.practiceStyle === "simulation";
  
  let hintHtml = "";
  if (isSim) {
    hintHtml = s.hintLevel >= 1
      ? `<button type="button" class="st-link" disabled>${icon("bulb", 16)}Hint used</button>`
      : `<button type="button" class="st-link" data-action="bottleneck-hint">${icon("bulb", 16)}Hint<span class="dim"> −½ pt</span></button>`;
  } else {
    hintHtml = s.hintLevel >= 3
      ? `<button type="button" class="st-link" disabled>${icon("bulb", 16)}Hints used</button>`
      : `<button type="button" class="st-link" data-action="bottleneck-hint">${icon("bulb", 16)}Get a hint</button>`;
  }

  const archHtml = rail(s.task.architecture || s.task.components || [], -1, s.selectedComponentIdx, true);
  
  const hintBlocks = s.hints.filter(Boolean).map(h => `<div class="st-feedback st-mt8">${esc(h)}</div>`).join("");
  
  let fieldsHtml = "";
  let dockHtml = "";
  
  if (isSim) {
    fieldsHtml = `
      <div class="st-qrow"><span class="st-label">What breaks, and why?</span>${hintHtml}</div>
      ${hintBlocks}
      <textarea id="bottleneckAnswer" class="st-field h140 st-mt8" placeholder="What fails, under what load or failure, and how you'd fix it" aria-label="What breaks, and why">${esc(s.draft)}</textarea>`;
    dockHtml = primaryBtn("bottleneck-submit", "Submit", 'id="bottleneckSubmit" disabled');
  } else {
    // Guided: 3 fields
    const f1 = `
      <div class="st-label st-mt24">What breaks?</div>
      <textarea id="bottleneckDraft1" class="st-field h80 st-mt8" placeholder="Name the component or behavior that fails.">${esc(s.draft)}</textarea>
    `;
    const f2 = `
      <div class="st-label st-mt24">Why does it fail?</div>
      <textarea id="bottleneckDraft2" class="st-field h80 st-mt8" placeholder="Describe the load, failure condition, or chain reaction.">${esc(s.draft2)}</textarea>
    `;
    const f3 = `
      <div class="st-label st-mt24">What would you change?</div>
      <textarea id="bottleneckDraft3" class="st-field h80 st-mt8" placeholder="Propose a fix and name one trade-off.">${esc(s.draft3)}</textarea>
    `;
    
    fieldsHtml = `<div class="st-qrow"><span class="st-label">Diagnosis</span>${hintHtml}</div>${hintBlocks}` + f1;
    if (s.guidedStep >= 2) fieldsHtml += f2;
    if (s.guidedStep >= 3) fieldsHtml += f3;
    
    if (s.guidedStep < 3) {
      dockHtml = primaryBtn("bottleneck-continue", "Continue", 'id="bottleneckContinue" disabled');
    } else {
      dockHtml = primaryBtn("bottleneck-submit", "Submit", 'id="bottleneckSubmit" disabled');
    }
  }

  paintShell({
    mode: "What breaks",
    prompt: s.task.narrative,
    promptClass: "text",
    progress: 0,
    counter: "0 / 1",
    body: `
      <div class="st-label st-mt20">Architecture</div>
      ${archHtml}
      <div class="st-mt24">${fieldsHtml}</div>`,
    dock: dockHtml,
  });

  if (isSim) {
    const box = /** @type {HTMLTextAreaElement} */ (document.getElementById("bottleneckAnswer"));
    bindField(box, {
      btn: /** @type {HTMLButtonElement} */ (document.getElementById("bottleneckSubmit")),
      onChange: (v) => { s.draft = v; },
      onSubmit: () => submitBottleneck(),
    });
    if (!s.hints.length) focusEnd(box);
  } else {
    const b1 = /** @type {HTMLTextAreaElement} */ (document.getElementById("bottleneckDraft1"));
    const b2 = /** @type {HTMLTextAreaElement} */ (document.getElementById("bottleneckDraft2"));
    const b3 = /** @type {HTMLTextAreaElement} */ (document.getElementById("bottleneckDraft3"));
    
    const contBtn = /** @type {HTMLButtonElement} */ (document.getElementById("bottleneckContinue"));
    const subBtn = /** @type {HTMLButtonElement} */ (document.getElementById("bottleneckSubmit"));
    
    const checkStep = () => {
      if (s.guidedStep === 1) {
        if (s.draft.length >= 12 && contBtn) contBtn.disabled = false;
        else if (contBtn) contBtn.disabled = true;
      } else if (s.guidedStep === 2) {
        if (s.draft2.length >= 12 && contBtn) contBtn.disabled = false;
        else if (contBtn) contBtn.disabled = true;
      } else {
        if (s.draft.trim() && s.draft2.trim() && s.draft3.trim() && subBtn) subBtn.disabled = false;
        else if (subBtn) subBtn.disabled = true;
      }
    };
    
    if (b1) {
      b1.addEventListener("input", () => { s.draft = b1.value; checkStep(); });
      b1.addEventListener("keydown", (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          if (s.guidedStep === 1 && !contBtn?.disabled) contBtn?.click();
          else if (s.guidedStep === 3 && !subBtn?.disabled) subBtn?.click();
        }
      });
    }
    if (b2) {
      b2.addEventListener("input", () => { s.draft2 = b2.value; checkStep(); });
      b2.addEventListener("keydown", (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          if (s.guidedStep === 2 && !contBtn?.disabled) contBtn?.click();
          else if (s.guidedStep === 3 && !subBtn?.disabled) subBtn?.click();
        }
      });
    }
    if (b3) {
      b3.addEventListener("input", () => { s.draft3 = b3.value; checkStep(); });
      b3.addEventListener("keydown", (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          if (!subBtn?.disabled) subBtn?.click();
        }
      });
    }
    
    checkStep();
    if (!s.hints.length) {
      if (s.guidedStep === 1 && b1) focusEnd(b1);
      else if (s.guidedStep === 2 && b2) focusEnd(b2);
      else if (s.guidedStep === 3 && b3) focusEnd(b3);
    }
  }
}

export function bottleneckAction(action) {
  const s = bottleneckState;
  if (!s) return;
  if (action.startsWith("rail-")) {
    const idx = parseInt(action.split("-")[1], 10);
    if (!isNaN(idx)) {
      s.selectedComponentId = s.task.components ? s.task.components[idx].id : String(idx);
      s.selectedComponentIdx = idx;
      paintBottleneckQuestion();
    }
    if (action === "rail-clear") {
      s.selectedComponentId = null;
      s.selectedComponentIdx = -1;
      paintBottleneckQuestion();
    }
    return;
  }
  if (action === "continue") {
    s.guidedStep++;
    paintBottleneckQuestion();
    return;
  }
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
  if (!s || s.step !== "answering") return;
  const isSim = s.task.practiceStyle === "simulation";
  if (isSim && s.hintLevel >= 1) return;
  if (!isSim && s.hintLevel >= 3) return;

  if (isSim) {
    s.draft = /** @type {HTMLTextAreaElement|null} */ (document.getElementById("bottleneckAnswer"))?.value || s.draft;
  } else {
    s.draft = /** @type {HTMLTextAreaElement|null} */ (document.getElementById("bottleneckDraft1"))?.value || s.draft;
    s.draft2 = /** @type {HTMLTextAreaElement|null} */ (document.getElementById("bottleneckDraft2"))?.value || s.draft2;
    s.draft3 = /** @type {HTMLTextAreaElement|null} */ (document.getElementById("bottleneckDraft3"))?.value || s.draft3;
  }
  
  const btn = /** @type {HTMLButtonElement|null} */ (app.querySelector('[data-action="bottleneck-hint"]'));
  if (btn) btn.disabled = true;
  
  const token = (s.token = {});
  try {
    const res = await send({ type: "BOTTLENECK_HINT", state: s.task.state });
    if (bottleneckState !== s || s.token !== token) return;
    s.hints[res.level - 1] = res.hint;
    s.hintLevel = res.level;
    s.task.state = res.state;
    if (isSim) s.usedHint = true;
  } catch (e) {
    if (bottleneckState !== s || s.token !== token) return;
    toast(e.message);
  }
  paintBottleneckQuestion();
}

export async function submitBottleneck() {
  const s = bottleneckState;
  if (!s || s.step !== "answering") return;
  
  let answer = "";
  let parts = undefined;
  
  if (s.task.practiceStyle === "simulation") {
    const box = document.getElementById("bottleneckAnswer");
    answer = (/** @type {HTMLTextAreaElement|null} */ (box))?.value.trim() || s.draft;
    s.draft = answer;
  } else {
    parts = {
      flaw: s.draft.trim(),
      reason: s.draft2.trim(),
      fix: s.draft3.trim()
    };
    answer = `What breaks: ${parts.flaw}\nWhy it fails: ${parts.reason}\nFix and tradeoff: ${parts.fix}`;
  }
  
  if (!answer.trim()) return;

  s.step = "grading";
  paintLoader("Reviewing your answer…");
  const token = (s.token = {});
  try {
    const res = await send({ 
      type: "BOTTLENECK_GRADE", 
      state: s.task.state, 
      answer, 
      componentId: s.selectedComponentId, 
      parts, 
      usedHint: s.usedHint 
    });
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
  const kind = r.verdict === "correct" ? "ok" : r.verdict === "partly_right" ? "part" : "no";
  const label = { ok: "Correct", part: "Partly right", no: "Not quite" }[kind] || "Not quite";
  const arch = s.task.components || s.task.architecture || [];
  
  let failingIdx = -1;
  if (r.failingComponentId) {
    failingIdx = arch.findIndex(c => c.id === r.failingComponentId);
  } else {
    failingIdx = failingIndex(arch, r.planted_flaw);
  }

  const scoreLine = `Score ${r.score} / ${r.maxScore || 3}${r.hintPenalty ? " (hint penalty applied)" : ""}`;
  
  const summaryBlock = feedbackSummary({
    strongest: r.strongestPart,
    gap: r.highestLeverageGap,
    scoreLine
  });

  const criteriaBlock = r.criteria ? `
    <div class="st-mt24" style="display:flex;flex-direction:column;gap:12px">
      ${Object.entries(r.criteria).map(([k, v]) => {
        const title = k === "foundFlaw" ? "Found flaw" : k === "explainedFailure" ? "Explained failure" : "Proposed fix";
        const iconName = v.status === "covered" ? "check" : v.status === "partial" ? "check" : "x";
        const color = v.status === "covered" ? "var(--status-mastered)" : v.status === "partial" ? "var(--status-learning)" : "var(--text-secondary)";
        return `<div style="display:flex;gap:12px;align-items:start">
          <span style="color:${color};margin-top:2px">${icon(iconName, 16, 2.5)}</span>
          <div>
            <div style="font-weight:650;font-size:14px;color:var(--text-primary)">${title}</div>
            ${v.note ? `<div style="font-size:14px;color:var(--text-secondary);margin-top:2px">${esc(v.note)}</div>` : ""}
          </div>
        </div>`;
      }).join("")}
    </div>
  ` : "";

  paintShell({
    mode: "What breaks",
    progress: 100,
    counter: "1 / 1",
    hasProgress: true,
    promptHtml: `<div class="st-prompt text st-clamp" id="bnScenario">${esc(s.task.narrative)}</div>`,
    body: `
      <button type="button" class="st-link st-mt6" id="bnScenarioBtn" data-action="bottleneck-toggle-scenario">Show full scenario</button>
      <div class="st-label st-mt20">Architecture</div>
      ${rail(arch, failingIdx, s.selectedComponentIdx, false)}
      <div class="st-mt24">${verdictRow(kind, label)}</div>
      ${r.feedback ? `<div class="st-feedback">${esc(r.feedback)}</div>` : ""}
      ${r.alternateProblem ? `<div class="st-feedback">You also spotted a real problem: ${esc(r.alternateProblem.description)}</div>` : ""}
      
      <div class="st-mt24">${summaryBlock}</div>
      <button type="button" class="st-link st-mt12" id="bnSuggestBtn">Turn gaps into review cards</button>
      ${criteriaBlock}
      
      <button type="button" class="st-link st-mt24" id="bnModelBtn" data-action="bottleneck-toggle-model">Compare your approach</button>
      <div id="bnModel" hidden>
        <div class="st-label st-mt16">The flaw</div>
        <div class="st-text15 st-mt4">${esc(r.modelAnswer?.flaw || r.planted_flaw)}</div>
        ${(r.modelAnswer?.whyItFails || r.why_it_fails) ? `<div class="st-label st-mt16">Why it fails</div><div class="st-text15 st-mt4">${esc(r.modelAnswer?.whyItFails || r.why_it_fails)}</div>` : ""}
        <div class="st-label st-mt16">A good fix</div>
        <div class="st-text15 st-mt4">${esc(r.modelAnswer?.goodFix || r.model_solution)}</div>
        ${(r.modelAnswer?.tradeoff || r.tradeoff) ? `<div class="st-label st-mt16">Trade-off</div><div class="st-text15 st-mt4">${esc(r.modelAnswer?.tradeoff || r.tradeoff)}</div>` : ""}
      </div>`,
    dock: primaryBtn("return-focus", "Finish"),
  });

  document.getElementById("bnSuggestBtn")?.addEventListener("click", () => {
    const gaps = [];
    if (r.criteria?.foundFlaw?.status !== "covered") gaps.push({ type: "missed_bottleneck", text: `Missed flaw: ${r.planted_flaw}` });
    if (r.criteria?.proposedFix?.status !== "covered") gaps.push({ type: "missing_tradeoff", text: `Missed fix or trade-off. Model solution: ${r.model_solution}` });
    if (r.highestLeverageGap) gaps.push({ type: "missed_bottleneck", text: r.highestLeverageGap });
    openSuggestionSheet(s.sessionId, "bottleneck", gaps, s.topic, s.cards);
  });
}
