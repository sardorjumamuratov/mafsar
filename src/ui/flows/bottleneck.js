
import { XBTN, app, bundle, esc, send, setFor, setHTML, toast } from "../core.js";
import { setFocusReturn } from "../flows/review.js";
import { showChrome } from "../nav.js";
import { appendReviewLog, bumpActivity, uid } from "../../storage/store.js";
import { drillLogEntry } from "../../storage/drill-log.js";
import { renderArchitecture } from "../../storage/bottleneck.js";

export let bottleneckState = null; // { sessionId, topic, cards, task, hint, result, step, token, usedHint, draft }
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
    cards: cards.map(c => ({ front: c.front, back: c.back })),
    task: null,
    hint: null,
    result: null,
    step: "generating",
    usedHint: false,
    draft: "",
  };
  setFocusReturn("set:" + sessionId);
  showChrome(false);
  paintBottleneckLoader("Designing an architecture...");
  requestBottleneckTask();
}

function paintBottleneckLoader(msg) {
  setHTML(app, `
    <div class="rev-top">${XBTN}</div>
    <div class="rev-body teach">
      <div class="t-label">Find the bottleneck</div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
        <span class="spinner" style="border-color:var(--border);border-top-color:var(--primary)"></span>
        <span style="font-size:13px;color:var(--muted)">${esc(msg)}</span>
      </div>
    </div>`);
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
    (/** @type {HTMLElement} */ (document.querySelector(".rev-top .xbtn")))?.click();
  }
}

export function paintBottleneckQuestion() {
  const s = bottleneckState;
  
  setHTML(app, `
    <div class="rev-top">${XBTN}</div>
    <div class="rev-body teach">
      <div class="t-label">Scenario</div>
      <p class="teach-lead" style="margin-bottom:16px;font-size:16px">${esc(s.task.narrative)}</p>
      
      <div class="t-label">Architecture</div>
      <pre class="arch-flow" role="img" aria-label="Request flow: ${esc((s.task.architecture || []).join(", then "))}">${esc(renderArchitecture(s.task.architecture))}</pre>
      
      ${s.hint ? `<div class="t-label">Hint</div><div class="block tint" style="margin-bottom:16px">${esc(s.hint)}</div>` : `<button class="btn btn-ghost btn-sm" data-action="bottleneck-hint" style="margin-bottom:16px">Get a hint (costs half a point)</button>`}
      
      <div class="t-label">What breaks and why?</div>
      <textarea id="bottleneckAnswer" class="sa-input" placeholder="What breaks, why (under what load or failure), and how you'd fix it." rows="6">${esc(s.draft)}</textarea>
      <button class="btn btn-primary btn-block" data-action="bottleneck-submit" style="margin-top:12px">Submit</button>
    </div>`);
}

export async function requestBottleneckHint() {
  const s = bottleneckState;
  if (s.usedHint) return;
  s.draft = /** @type {HTMLTextAreaElement|null} */ (document.getElementById("bottleneckAnswer"))?.value || "";
  s.usedHint = true;
  paintBottleneckLoader("Getting a hint...");
  const token = (s.token = {});
  try {
    const res = await send({ type: "BOTTLENECK_HINT", state: s.task.state });
    if (bottleneckState !== s || s.token !== token) return;
    s.hint = res.hint;
    paintBottleneckQuestion();
  } catch(e) {
    if (bottleneckState !== s || s.token !== token) return;
    toast(e.message);
    paintBottleneckQuestion();
  }
}

export async function submitBottleneck() {
  const s = bottleneckState;
  const box = document.getElementById("bottleneckAnswer");
  const ans = ((/** @type {HTMLTextAreaElement|null} */ (box))?.value || "").trim();
  if (!ans) return toast("Write an answer.");
  
  paintBottleneckLoader("Grading...");
  const token = (s.token = {});
  try {
    s.draft = ans;
    const res = await send({ type: "BOTTLENECK_GRADE", state: s.task.state, answer: ans, usedHint: s.usedHint });
    if (bottleneckState !== s || s.token !== token) return;
    s.result = res;
    
    await Promise.all([
      bumpActivity(1),
      appendReviewLog(drillLogEntry({ kind: "bottleneck", sessionId: s.sessionId, fraction: (Number(res.score) || 0) / 3, id: uid() })),
    ]);
    
    s.step = "revealed";
    paintBottleneckReveal();
  } catch(e) {
    if (bottleneckState !== s || s.token !== token) return;
    toast(e.message);
    paintBottleneckQuestion();
  }
}

function paintBottleneckReveal() {
  const s = bottleneckState;
  const r = s.result;
  
  const scoreBadge = (pass) => pass 
    ? `<span class="idea-chip ok">Pass</span>`
    : `<span class="idea-chip no">Miss</span>`;
    
  setHTML(app, `
    <div class="rev-top">${XBTN}</div>
    <div class="rev-body teach">
      <div class="t-label">Score ${esc(r.score)} / 3${r.usedHint ? " (hint used)" : ""}</div>
      <div class="block tint" style="margin-bottom:16px">${esc(r.feedback)}</div>
      ${r.other_valid_issue ? `<div class="block" style="margin-bottom:16px"><b>Also a real problem you spotted:</b> ${esc(r.other_valid_issue)}</div>` : ""}
      
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;background:var(--surface-2);padding:12px;border-radius:8px">
          <span style="font-size:14px;font-weight:500">Found flaw</span>
          ${scoreBadge(r.found_flaw)}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;background:var(--surface-2);padding:12px;border-radius:8px">
          <span style="font-size:14px;font-weight:500">Valid explanation</span>
          ${scoreBadge(r.explanation_correct)}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;background:var(--surface-2);padding:12px;border-radius:8px">
          <span style="font-size:14px;font-weight:500">Fix works</span>
          ${scoreBadge(r.fix_works)}
        </div>
      </div>
      
      <div class="t-label">The Planted Flaw</div>
      <div style="background:var(--surface-2);padding:16px;border-radius:8px;margin-bottom:16px">
        <p style="margin-bottom:8px;font-weight:600;color:var(--danger)">${esc(r.planted_flaw)}</p>
        ${r.why_it_fails ? `<div style="font-size:14px;line-height:1.5;margin-bottom:8px">${esc(r.why_it_fails)}</div>` : ""}
        <div style="font-size:14px;color:var(--ink);line-height:1.5"><b>A good fix:</b> ${esc(r.model_solution)}</div>
      </div>
      
      <button class="btn btn-primary btn-block" data-action="return-focus" style="margin-top:16px">Done</button>
    </div>`);
}

