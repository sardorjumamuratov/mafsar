import { paintReviewCard, qIdx, queue, setQIdx } from "../flows/review.js";
import { XBTN, app, esc, send, setHTML, toast } from "../core.js";
import { appendReviewLog, bumpActivity, uid } from "../../storage/store.js";
import { review } from "../../storage/srs.js";

export let applyState = null; // { item, hypothetical, phase }

export async function startApply() {
  const item = queue[qIdx];
  if (!item || !item.card.back) return paintReviewCard();
  applyState = { item, phase: "loading" };
  setHTML(app, `
    <div class="rev-top">${XBTN}<div class="bar"><i style="width:${Math.round((qIdx / queue.length) * 100)}%"></i></div>
      <span class="rev-count tnum">${qIdx + 1} / ${queue.length}</span></div>
    <div class="rev-body">
      <div class="t-label">Apply it</div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
        <span class="spinner" style="border-color:var(--border);border-top-color:var(--primary)"></span>
        <span style="font-size:13px;color:var(--muted)">Writing a fresh scenario…</span>
      </div>
    </div>`);
  try {
    const r = await send({
      type: "GENERATE_HYPOTHETICAL",
      concept: item.card.front,
      reference: item.card.back,
    });
    (/** @type {any} */ (applyState)).hypothetical = /** @type {any} */ (r).hypothetical;
    applyState.phase = "answer";
    paintApplyAnswer();
  } catch (e) {
    toast(e.message);
    setQIdx(qIdx + 1);
    paintReviewCard();
  }
}

export function paintApplyAnswer() {
  const { hypothetical } = applyState;
  setHTML(app, `
    <div class="rev-top">${XBTN}<div class="bar"><i style="width:${Math.round((qIdx / queue.length) * 100)}%"></i></div>
      <span class="rev-count tnum">${qIdx + 1} / ${queue.length}</span></div>
    <div class="rev-body">
      <div class="t-label">Apply it — new scenario</div>
      <div class="hypothetical">${esc(hypothetical.scenario)}</div>
      <textarea id="applyAnswer" class="sa-input" rows="4" placeholder="Type your answer…"></textarea>
      <button class="btn btn-primary btn-block" data-action="apply-check">Check answer</button>
    </div>`);
}

export async function checkApply() {
  const answer = /** @type {HTMLInputElement} */ (document.getElementById("applyAnswer"))?.value.trim();
  if (!answer) return toast("Type an answer first.");
  const { item, hypothetical } = applyState;
  const btn = app.querySelector('[data-action="apply-check"]');
  /** @type {HTMLButtonElement} */ (btn).disabled = true;
  btn.textContent = "Grading…";
  try {
    const r = await send({
      type: "GRADE_ANSWER",
      question: hypothetical.scenario,
      reference: hypothetical.rubric,
      answer,
    });
    await Promise.all([
      bumpActivity(1),
      appendReviewLog({
        id: uid(), cardId: item.card.id, sessionId: item.sessionId,
        grade: r.grading.correct ? 4 : 1, prevInterval: 0, newInterval: 0,
        reviewedAt: new Date().toISOString(),
      }),
    ]);
    paintGraded(r.grading, "apply-next");
  } catch (e) {
    toast(e.message);
    /** @type {HTMLButtonElement} */ (btn).disabled = false;
    btn.textContent = "Check answer";
  }
}

/** Shared score + feedback panel for AI-graded typed answers. */
export function paintGraded(grading, nextAction) {
  const box = document.createElement("div");
  box.className = "graded";
  setHTML(box, `
    <div class="score-row">
      <div class="score tnum ${grading.correct ? "ok" : "no"}">${grading.score}</div>
      <div><b style="color:${grading.correct ? "var(--success)" : "var(--danger)"}">${grading.correct ? "Correct" : "Needs work"}</b>
        <div class="feedback">${esc(grading.feedback)}</div></div>
    </div>
    <button class="btn btn-primary btn-block" data-action="${nextAction}">Continue</button>`);
  const body = app.querySelector(".rev-body");
  if (body) {
    body.querySelector(".sa-input")?.remove();
    body.querySelector('[data-action="apply-check"]')?.remove();
    body.querySelector('[data-action="typed-check"]')?.remove();
    body.appendChild(box);
  }
}

// --- Coding practice: a standalone session started from the set ------------
// A peer of typed practice, NOT part of the review queue — each exercise is
// an LLM round trip plus real writing time, so sessions are short (5) and
// never block grading. The starter stub keeps exercises small; length is only
// ever a system cap (see storage/coding.js).
