import { XBTN, app, bundle, esc, send, setFor, setHTML, toast } from "../core.js";
import { isDue } from "../../storage/srs.js";
import { setFocusReturn } from "../flows/review.js";
import { showChrome } from "../nav.js";
import { appendReviewLog, bumpActivity, uid } from "../../storage/store.js";
import { paintGraded } from "../flows/apply.js";

export let typedState = null; // { sessionId, items, idx }

export async function startTypedPractice(sessionId) {
  const { studySets } = await bundle();
  const set = setFor(sessionId, studySets);
  const cards = (set?.flashcards || []).filter((c) => c.back);
  if (!cards.length) return toast("This set has no cards yet.");
  const due = cards.filter((c) => isDue(c));
  const items = (due.length ? due : cards).slice(0, 10).map((card) => ({ sessionId, card }));
  const token = Math.random();
  typedState = { sessionId, items, idx: 0, token };
  setFocusReturn("set:" + sessionId);
  showChrome(false);
  paintTypedQ();
}

export function paintTypedQ() {
  const { items, idx } = typedState;
  if (idx >= items.length) {
    setHTML(app, `
      <div class="view">
        <div class="done-msg"><div class="big">✍️</div>
          <div style="font-weight:650;color:var(--ink)">Practice complete</div>
          <div style="margin-top:4px">${items.length} typed answer${items.length === 1 ? "" : "s"} graded.</div>
        </div>
        <button class="btn btn-primary btn-block" data-action="return-focus">Done</button>
      </div>`);
    return;
  }
  const { card } = items[idx];
  setHTML(app, `
    <div class="rev-top">${XBTN}<div class="bar"><i style="width:${Math.round((idx / items.length) * 100)}%"></i></div>
      <span class="rev-count tnum">${idx + 1} / ${items.length}</span></div>
    <div class="rev-body">
      <div class="t-label">Type the answer</div>
      <div style="font-size:16px;font-weight:600;line-height:1.35">${esc(card.front)}</div>
      <textarea id="typedAnswer" class="sa-input" rows="3" placeholder="Answer in your own words…"></textarea>
      <button class="btn btn-primary btn-block" data-action="typed-check">Check answer</button>
      <div class="help" style="margin:0;text-align:center">AI-graded against this card's answer.</div>
    </div>`);
}

export async function checkTyped() {
  const answer = /** @type {HTMLInputElement} */ (document.getElementById("typedAnswer"))?.value.trim();
  if (!answer) return toast("Type an answer first.");
  const { card } = typedState.items[typedState.idx];
  const btn = app.querySelector('[data-action="typed-check"]');
  /** @type {HTMLButtonElement} */ (btn).disabled = true;
  btn.textContent = "Grading…";
  const token = typedState.token;
  try {
    const r = await send({ type: "GRADE_ANSWER", question: card.front, reference: card.back, answer });
    if (!typedState || typedState.token !== token) return;
    await Promise.all([
      bumpActivity(1),
      appendReviewLog({
        id: uid(), cardId: card.id, sessionId: typedState.sessionId,
        grade: r.grading.correct ? 4 : 1, prevInterval: 0, newInterval: 0,
        reviewedAt: new Date().toISOString(),
      }),
    ]);
    paintGraded(r.grading, "typed-next");
  } catch (e) {
    toast(e.message);
    /** @type {HTMLButtonElement} */ (btn).disabled = false;
    btn.textContent = "Check answer";
  }
}


export function typedNext() { typedState.idx++; paintTypedQ(); }
