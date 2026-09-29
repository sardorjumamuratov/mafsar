import { paintReviewCard, qIdx, queue, setQIdx } from "../flows/review.js";
import { XBTN, app, esc, send, setHTML, toast } from "../core.js";
import { appendReviewLog, bumpActivity, uid } from "../../storage/store.js";
import { review } from "../../../shared/srs.js";

export let applyState = null; // { item, hypothetical, phase }

export async function startApply() {
  const item = queue[qIdx];
  if (!item || !item.card.back) return paintReviewCard();
  const token = Math.random();
  applyState = { item, phase: "loading", token };
  setHTML(app, `
    
      <div class="ahd" style="display:flex;align-items:center;padding:12px;gap:12px">
        <button class="iconbtn" data-action="return-focus" aria-label="End session"><svg class="ic" viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
        <div class="focus-track">
          <div class="focus-fill" style="width:${Math.round((qIdx / queue.length) * 100)}%"</div>
        </div>
        <div style="font-size:13px;color:var(--text-muted);font-variant-numeric:tabular-nums">${qIdx + 1} / ${queue.length}</div>
      </div>
    <div class="rev-body">
      <div class="t-label">Apply it</div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
        <span class="spinner" style="border-color:var(--border-control);border-top-color:var(--accent)"></span>
        <span style="font-size:13px;color:var(--text-muted)">Writing a fresh scenario…</span>
      </div>
    </div>`);
  try {
    const r = await send({
      type: "GENERATE_HYPOTHETICAL",
      concept: item.card.front,
      reference: item.card.back,
    });
    if (!applyState || applyState.token !== token) return;
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
    
      <div class="ahd" style="display:flex;align-items:center;padding:12px;gap:12px">
        <button class="iconbtn" data-action="return-focus" aria-label="End session"><svg class="ic" viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
        <div class="focus-track">
          <div class="focus-fill" style="width:${Math.round((qIdx / queue.length) * 100)}%"</div>
        </div>
        <div style="font-size:13px;color:var(--text-muted);font-variant-numeric:tabular-nums">${qIdx + 1} / ${queue.length}</div>
      </div>
    <div class="rev-body">
      <div class="t-label">Apply it — new scenario</div>
      <div class="hypothetical">${esc(hypothetical.scenario)}</div>
      <textarea id="applyAnswer" class="sa-input" rows="4" placeholder="Type your answer…"></textarea>
      <button class="btn-primary btn-block" data-action="apply-check">Check answer</button>
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
    if (applyState?.hypothetical !== hypothetical) return;
    await Promise.all([
      bumpActivity(1),
      appendReviewLog({
        kind: "apply", stability: item.card.stability, difficulty: item.card.difficulty,
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
      <div><b style="color:${grading.correct ? "var(--status-mastered)" : "var(--danger-text)"}">${grading.correct ? "Correct" : "Needs work"}</b>
        <div class="feedback">${esc(grading.feedback)}</div></div>
    </div>
    <button class="btn-primary btn-block" data-action="${nextAction}">Continue</button>`);
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
