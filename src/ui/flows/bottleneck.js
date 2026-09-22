
import { XBTN, app, bundle, esc, send, setFor, setHTML, toast } from "../core.js";
import { setFocusReturn } from "../flows/review.js";
import { showChrome } from "../nav.js";
import { appendReviewLog, bumpActivity, uid } from "../../storage/store.js";
import { renderArchitecture } from "../../storage/bottleneck.js";

export let bottleneckState = null; // { sessionId, topic, cards, task, hint, result, step, token, usedHint }

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
    <div class="rev-body teach" style="padding-bottom:120px">
      <div class="t-label">Scenario</div>
      <p class="teach-lead" style="margin-bottom:16px;font-size:16px">${esc(s.task.narrative)}</p>
      
      <div class="t-label">Architecture</div>
      <div style="background:var(--surface-2);padding:16px;border-radius:8px;margin-bottom:20px;font-family:monospace;font-size:14px;overflow-x:auto;white-space:pre">
${esc(renderArchitecture(s.task.architecture))}
      </div>
      
      ${s.hint ? `<div class="t-label">Hint</div><div class="block tint" style="margin-bottom:16px">${esc(s.hint)}</div>` : `<button class="btn btn-ghost" data-action="bottleneck-hint" style="margin-bottom:16px;font-size:13px">Get a hint</button>`}
      
      <div class="t-label">What breaks and why?</div>
      <textarea id="bottleneckAnswer" class="sa-input" placeholder="Name the flaw, explain what load breaks it, and propose a fix." rows="5" style="font-size:15px;padding:12px"></textarea>
      
      <div style="position:fixed;bottom:0;left:0;right:0;padding:16px;background:var(--bg);border-top:1px solid var(--border)">
        <button class="btn btn-primary btn-block" data-action="bottleneck-submit">Submit</button>
      </div>
    </div>`);
}

export async function requestBottleneckHint() {
  const s = bottleneckState;
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
    const res = await send({ type: "BOTTLENECK_GRADE", state: s.task.state, answer: ans });
    if (bottleneckState !== s || s.token !== token) return;
    s.result = res;
    
    // Log review
    const grade = s.usedHint ? 2 : 3;
    const writes = [bumpActivity(1)];
    writes.push(appendReviewLog({
      kind: "teach", stability: null, difficulty: null,
      id: uid(), cardId: "", sessionId: s.sessionId,
      grade, prevInterval: 0, newInterval: 0, reviewedAt: new Date().toISOString(),
    }));
    await Promise.all(writes);
    
    s.step = "revealed";
    paintBottleneckReveal();
  } catch(e) {
    if (bottleneckState !== s || s.token !== token) return;
    toast(e.message);
    paintBottleneckQuestion();
    // restore their text
    const newBox = document.getElementById("bottleneckAnswer");
    if (newBox) (/** @type {HTMLTextAreaElement} */ (newBox)).value = ans;
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
      <div class="t-label">Feedback</div>
      <div class="block tint" style="margin-bottom:16px">${esc(r.feedback)}</div>
      
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
        <p style="margin-bottom:8px;font-weight:600;color:var(--no)">${esc(r.planted_flaw)}</p>
        <div style="font-size:14px;color:var(--text-p);line-height:1.5">${esc(r.model_solution)}</div>
      </div>
      
      <button class="btn btn-primary btn-block" data-action="return-focus" style="margin-top:16px">Done</button>
    </div>`);
}

