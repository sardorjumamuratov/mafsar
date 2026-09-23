
import { app, bundle, esc, setHTML, setFor, send, toast } from "../core.js";
import { appendReviewLog, bumpActivity, updateCard } from "../../storage/store.js";
import { orderedSteps } from "../../storage/chains.js";
import { linkId } from "../../storage/chain-links.js";
import { failedLinkIds, pickDrillChain, roundScore, shuffledOrder, EXERCISES } from "../../storage/chain-drill.js";
import { drillLogEntry } from "../../storage/drill-log.js";
import { renderSetDetail } from "../views/set-detail.js";
import { review } from "../../../shared/srs.js";

const LABELS = { cause: "Cause", mechanism: "Mechanism", physiological: "Physiological change", symptoms: "Symptoms", signs: "Signs", tests: "Tests", diagnosis: "Diagnosis", treatment: "Treatment" };

let cSetId = null;
let cChain = null;
let cSteps = [];
let state = null;

export async function startChainDrill(sessionId) {
  const { studySets, reviewLog } = await bundle();
  const set = setFor(sessionId, studySets);
  if (!set || !set.chains) return;
  
  const chain = pickDrillChain(set.chains, reviewLog, sessionId);
  if (!chain) return toast("Fill in at least two steps of a chain to drill it.");

  cSetId = sessionId;
  cChain = chain;
  const ex = EXERCISES[Math.floor(Math.random() * EXERCISES.length)];
  
  cSteps = orderedSteps(cChain).filter(s => s.step && s.step.statement);
  if (cSteps.length < 2) return toast("Not enough filled steps in this chain.");
  
  state = { type: ex };
  cSteps.forEach(s => s.failed = false);
  
  app.dataset.drillFlow = "active";
  
  if (ex === "rebuild") renderRebuild();
  else if (ex === "gap") renderGap();
  else if (ex === "backwards") renderBackwards();
}

function finishDrill(failedLinks) {
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
  
  const takeaway = failedLinks?.length ? "Keep at it! Some links need a bit more practice." : "Perfect! You nailed this chain.";
  
  setHTML(app, `
    <div class="view" style="padding:16px; overflow-y:auto; padding-bottom:100px;">
      <div class="h-title" style="margin-bottom:16px">Drill complete</div>
      <div class="help" style="margin-bottom:16px">${esc(takeaway)}</div>
      <div class="block chain">
        <ol class="chain-steps">
          ${cSteps.map((s, i) => {
             const arrow = i ? `<li class="chain-arrow" aria-hidden="true">↓</li>` : "";
             const failedStyle = s.failed ? `style="border:1px solid var(--danger);"` : "";
             return `${arrow}<li class="chain-step" ${failedStyle}>
                 <span class="chain-label">${esc(s.label)}</span>
                 <details class="chain-body" open>
                   <summary class="chain-text">${esc(s.step.statement)}</summary>
                   <div class="chain-why">${s.step.why ? esc(s.step.why) : "No explanation of this link in your source."}</div>
                 </details>
               </li>`;
          }).join("")}
        </ol>
      </div>
      <div style="display:flex;gap:10px;margin-top:20px">
        <button class="btn btn-ghost" style="flex:1" data-drill-action="done">Done</button>
        <button class="btn btn-primary" style="flex:2" data-drill-action="another">Another round</button>
      </div>
    </div>
  `);
}

async function penalizeLinks(linkIds) {
  const { studySets } = await bundle();
  const set = setFor(cSetId, studySets);
  if (!set) return;
  for (const linkId of linkIds) {
    const card = set.flashcards?.find(c => c.id === linkId);
    if (card) {
       const upd = review(card, 0, Date.now(), set.examDate);
       Object.assign(card, upd);
       await updateCard(cSetId, card.id, upd);
    }
  }
}

function renderRebuild() {
  if (!state.placed) {
    state.placed = [];
    state.remaining = shuffledOrder(cSteps.length);
    state.errorIdx = null;
    state.revealIdx = null;
  }
  
  const placedHtml = state.placed.map((i, idx) => {
    const arrow = idx ? `<div class="chain-arrow" aria-hidden="true">↓</div>` : "";
    return `${arrow}<div class="chain-step"><span class="chain-label">${esc(cSteps[i].label)}</span><div class="chain-text">${esc(cSteps[i].step.statement)}</div></div>`;
  }).join("");
  
  const remainingHtml = state.remaining.map(i => {
    const isError = state.errorIdx === i;
    const isReveal = state.revealIdx === i;
    let style = "text-align:left;width:100%;margin-bottom:8px;";
    if (isError) style += "border-color:var(--danger);transform:translateX(5px);";
    if (isReveal) style += "border-color:var(--success);background-color:rgba(0,255,0,0.1);";
    return `<button class="chain-step linkbtn" data-drill-action="rebuild-pick" data-idx="${i}" style="${style}">
      <div class="chain-text">${esc(cSteps[i].step.statement)}</div>
    </button>`;
  }).join("");
  
  setHTML(app, `
    <div class="view" style="padding:16px; overflow-y:auto; padding-bottom:100px;">
      <div class="h-title" style="margin-bottom:16px">Rebuild the chain</div>
      <div class="help">Tap the next step in the sequence.</div>
      <div class="block chain" style="margin-bottom:20px;min-height:40px;border:1px dashed var(--border);padding:10px;border-radius:8px">
        ${placedHtml || `<div class="empty" style="text-align:center;color:var(--faint)">Sequence starts here</div>`}
      </div>
      <div>
        ${remainingHtml}
      </div>
    </div>
  `);
}

function handleRebuildPick(idx) {
  const nextExpected = state.placed.length;
  if (idx === nextExpected) {
    state.remaining = state.remaining.filter(i => i !== idx);
    state.placed.push(idx);
    state.errorIdx = null;
    state.revealIdx = null;
    if (state.placed.length === cSteps.length) {
       finishDrill(failedLinkIds(cChain, cSteps));
    } else {
       renderRebuild();
    }
  } else {
    state.errorIdx = idx;
    state.revealIdx = nextExpected;
    cSteps[nextExpected].failed = true;
    renderRebuild();
    setTimeout(() => {
      if (state && state.type === "rebuild") {
        state.errorIdx = null;
        state.revealIdx = null;
        renderRebuild();
      }
    }, 1500);
  }
}

function renderGap() {
  if (state.blankIdx === undefined) {
    state.blankIdx = Math.floor(Math.random() * cSteps.length);
    state.submitting = false;
    state.result = null;
  }
  
  const stepsHtml = cSteps.map((s, i) => {
    const arrow = i ? `<div class="chain-arrow" aria-hidden="true">↓</div>` : "";
    if (i === state.blankIdx) {
      if (state.result) {
         const cl = state.result.correct ? "" : `border:1px solid var(--danger);`;
         return `${arrow}<div class="chain-step" style="${cl}">
           <span class="chain-label">${esc(s.label)}</span>
           <div class="chain-text">${esc(s.step.statement)}</div>
           ${s.step.why ? `<div class="chain-why">${esc(s.step.why)}</div>` : ""}
         </div>`;
      } else {
         return `${arrow}<div class="chain-step" style="padding:10px">
           <span class="chain-label">${esc(s.label)}</span>
           <textarea id="gapInput" rows="2" style="width:100%;margin-top:8px" placeholder="Type the ${esc(s.label)}..."></textarea>
           <button class="btn btn-primary" data-drill-action="gap-submit" style="margin-top:8px;width:100%" ${state.submitting ? "disabled" : ""}>Check</button>
         </div>`;
      }
    }
    return `${arrow}<div class="chain-step"><span class="chain-label">${esc(s.label)}</span><div class="chain-text">${esc(s.step.statement)}</div></div>`;
  }).join("");

  setHTML(app, `
    <div class="view" style="padding:16px; overflow-y:auto; padding-bottom:100px;">
      <div class="h-title" style="margin-bottom:16px">Fill the gap</div>
      <div class="block chain">
        ${stepsHtml}
      </div>
      ${state.result ? `<button class="btn btn-primary btn-block" style="margin-top:20px" data-drill-action="gap-next">Continue</button>` : ""}
    </div>
  `);
  
  if (!state.result && !state.submitting) document.getElementById("gapInput")?.focus();
}

async function handleGapSubmit() {
  const input = (/** @type {any} */ (document.getElementById("gapInput")))?.value.trim();
  if (!input) return toast("Type an answer first");
  
  state.submitting = true;
  renderGap();
  
  try {
    const target = cSteps[state.blankIdx];
    const prev = state.blankIdx > 0 ? cSteps[state.blankIdx-1].step.statement : "None";
    const next = state.blankIdx < cSteps.length - 1 ? cSteps[state.blankIdx+1].step.statement : "None";
    const q = `In a medical mechanism chain, what is the ${target.label} step? The previous step is "${prev}" and the next step is "${next}".`;
    
    const res = await send({ type: "GRADE_ANSWER", question: q, reference: target.step.statement, answer: input });
    
    state.submitting = false;
    state.result = { correct: res.grading.correct };
    if (!res.grading.correct) cSteps[state.blankIdx].failed = true;
    renderGap();
  } catch (e) {
    state.submitting = false;
    renderGap();
    toast(e.message);
  }
}

function renderBackwards() {
  if (state.startIdx === undefined) {
    state.startIdx = Math.floor(Math.random() * (cSteps.length - 1)) + 1;
    state.currentIndex = state.startIdx - 1;
    state.history = [];
    state.submitting = false;
  }
  
  const stepsHtml = [];
  for (let i = state.currentIndex; i <= state.startIdx; i++) {
    const arrow = i < state.startIdx ? `<div class="chain-arrow" aria-hidden="true">↓</div>` : "";
    if (i === state.currentIndex) {
       stepsHtml.push(`<div class="chain-step" style="padding:10px">
           <span class="chain-label">Upstream: ${esc(cSteps[i].label)}</span>
           <textarea id="backInput" rows="2" style="width:100%;margin-top:8px" placeholder="What precedes the next step?"></textarea>
           <button class="btn btn-primary" data-drill-action="backwards-submit" style="margin-top:8px;width:100%" ${state.submitting ? "disabled" : ""}>Check</button>
         </div>${arrow}`);
    } else {
       const hist = state.history.find(h => h.idx === i);
       const cl = hist && !hist.correct ? `border:1px solid var(--danger);` : "";
       stepsHtml.push(`<div class="chain-step" style="${cl}">
           <span class="chain-label">${esc(cSteps[i].label)}</span>
           <div class="chain-text">${esc(cSteps[i].step.statement)}</div>
         </div>${arrow}`);
    }
  }

  setHTML(app, `
    <div class="view" style="padding:16px; overflow-y:auto; padding-bottom:100px;">
      <div class="h-title" style="margin-bottom:16px">Work backwards</div>
      <div class="help">What directly causes or precedes the step below?</div>
      <div class="block chain">
        ${stepsHtml.join("")}
      </div>
    </div>
  `);
  
  if (!state.submitting) document.getElementById("backInput")?.focus();
}

async function handleBackwardsSubmit() {
  const input = (/** @type {any} */ (document.getElementById("backInput")))?.value.trim();
  if (!input) return toast("Type an answer first");
  
  state.submitting = true;
  renderBackwards();
  
  try {
    const target = cSteps[state.currentIndex];
    const next = cSteps[state.currentIndex + 1];
    const q = `In a medical mechanism chain, what is the ${target.label} step that directly precedes "${next.step.statement}"?`;
    
    const res = await send({ type: "GRADE_ANSWER", question: q, reference: target.step.statement, answer: input });
    
    state.submitting = false;
    state.history.push({ idx: state.currentIndex, correct: res.grading.correct });
    if (!res.grading.correct) cSteps[state.currentIndex].failed = true;
    
    if (state.currentIndex === 0) {
       const failedLinks = [];
       for (let i = 0; i <= state.startIdx; i++) {
         if (cSteps[i].failed && i < cSteps.length - 1) failedLinks.push(linkId(cChain.id, cSteps[i].key, cSteps[i + 1].key));
       }
       finishDrill(failedLinks);
    } else {
       state.currentIndex--;
       renderBackwards();
    }
  } catch (e) {
    state.submitting = false;
    renderBackwards();
    toast(e.message);
  }
}

document.addEventListener("click", (e) => {
  const t = (/** @type {any} */ (e.target)).closest("[data-drill-action]");
  if (!t) return;
  const a = t.dataset.drillAction;
  
  if (a === "done") {
    renderSetDetail(cSetId, "chains");
  } else if (a === "another") {
    startChainDrill(cSetId);
  } else if (a === "rebuild-pick") {
    handleRebuildPick(Number(t.dataset.idx));
  } else if (a === "gap-submit") {
    handleGapSubmit();
  } else if (a === "gap-next") {
    const failedLinks = [];
    if (cSteps[state.blankIdx].failed) {
       if (state.blankIdx > 0) failedLinks.push(linkId(cChain.id, cSteps[state.blankIdx - 1].key, cSteps[state.blankIdx].key));
       if (state.blankIdx < cSteps.length - 1) failedLinks.push(linkId(cChain.id, cSteps[state.blankIdx].key, cSteps[state.blankIdx + 1].key));
    }
    finishDrill(failedLinks);
  } else if (a === "backwards-submit") {
    handleBackwardsSubmit();
  }
});

