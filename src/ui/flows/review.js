import { showChrome } from "../nav.js";
import { byDue, isDue, review } from "../../storage/srs.js";
import { XBTN, app, bundle, esc, replaceHTML, setFor, setHTML, toast } from "../core.js";
import { appendReviewLog, bumpActivity, uid, updateCard } from "../../storage/store.js";
import { syncNow } from "../../sync/sync.js";
import { quickQuizLen } from "../flows/quiz.js";
import { setCodingState } from "../flows/coding.js";
import { renderSetDetail } from "../views/set-detail.js";
import { renderHome } from "../views/home.js";

// ================================================================ REVIEW (focus)
export let queue = [],
  qIdx = 0,
  focusReturn = "home";
// Distinct cards graded this sitting. Not queue.length — relearning requeues a
// lapsed card, which would otherwise count it twice on the done screen.
export const reviewedIds = new Set();

export function startReview(items, ret) {
  queue = items;
  qIdx = 0;
  reviewedIds.clear();
  focusReturn = ret;
  showChrome(false);
  paintReviewCard();
}

export function gradePreview(card, g, examDate) {
  return review(card, g, Date.now(), examDate).interval;
}

export function paintReviewCard() {
  if (qIdx >= queue.length) return paintReviewDone();
  const { card } = queue[qIdx];
  setHTML(app, `
    <div class="rev-top">${XBTN}<div class="bar"><i style="width:${Math.round((qIdx / queue.length) * 100)}%"></i></div>
      <span class="rev-count tnum">${qIdx + 1} / ${queue.length}</span></div>
    <div class="rev-body">
      <div class="flashcard" data-action="flip">
        <div class="lab">Question</div>
        <div class="front">${esc(card.front)}</div>
      </div>
      <div class="flip-hint">Tap the card to reveal the answer</div>
    </div>`);
}

export function revealCard() {
  const { card } = queue[qIdx];
  const fc = app.querySelector(".flashcard");
  fc.removeAttribute("data-action");
  setHTML(fc, `<div class="lab">Question</div><div class="front">${esc(card.front)}</div>
    <div class="rule"></div><div class="back">${esc(card.back || "—")}</div>`);
  const hint = app.querySelector(".flip-hint");
  replaceHTML(hint, `<div class="grades">
      <button class="grade again" data-action="grade" data-g="0"><span class="g">Again</span><span class="iv">${gradePreview(card, 0, queue[qIdx].examDate)}d</span></button>
      <button class="grade" data-action="grade" data-g="3"><span class="g">Hard</span><span class="iv">${gradePreview(card, 3, queue[qIdx].examDate)}d</span></button>
      <button class="grade good" data-action="grade" data-g="4"><span class="g">Good</span><span class="iv">${gradePreview(card, 4, queue[qIdx].examDate)}d</span></button>
      <button class="grade good" data-action="grade" data-g="5"><span class="g">Easy</span><span class="iv">${gradePreview(card, 5, queue[qIdx].examDate)}d</span></button>
    </div>
    <button class="btn btn-ghost btn-block" data-action="apply-card" style="margin-top:10px">🎯 Apply it — fresh scenario</button>`);
}

export async function gradeCard(g) {
  const item = queue[qIdx];
  const prevInterval = item.card.interval ?? 0;
  const upd = review(item.card, g, Date.now(), item.examDate);
  Object.assign(item.card, upd);
  await updateCard(item.sessionId, item.card.id, upd);
  await Promise.all([
    bumpActivity(1),
    appendReviewLog({
      id: uid(), cardId: item.card.id, sessionId: item.sessionId, grade: g,
      prevInterval, newInterval: upd.interval, reviewedAt: new Date().toISOString(),
    }),
  ]);
  reviewedIds.add(item.card.id);
  qIdx++;
  // Relearning step: a lapsed card comes back a few positions later in this
  // sitting (Anki-style), so "Again" does not hide it until tomorrow. The
  // STORED schedule stays day-level (+1 day) for future sessions. Capped at 2
  // requeues per card so an endless "Again" loop cannot stall the session.
  if (g < 3 && (item.relearns || 0) < 2) {
    item.relearns = (item.relearns || 0) + 1;
    queue.splice(Math.min(qIdx + 3, queue.length), 0, item);
  }
  paintReviewCard();
}

// --- Apply step: a fresh hypothetical per concept, then typed grading --------
export async function paintReviewDone() {
  showChrome(false);
  const reviewed = reviewedIds.size || queue.length;
  syncNow().catch(() => {}); // push grades + pull changes after a session

  const paint = (cta) =>
    setHTML(app, `
      <div class="view">
        <div class="done-msg"><div class="big">🎉</div>
          <div style="font-weight:650;color:var(--ink)">Review complete</div>
          <div style="margin-top:4px">${reviewed} card${reviewed === 1 ? "" : "s"} reviewed.</div>
        </div>
        ${cta}
        <button class="btn btn-${cta ? "ghost" : "primary"} btn-block" data-action="return-focus">Done</button>
      </div>`);

  paint("");

  // Recognition (flashcards) then recall under pressure (quiz) is the natural
  // next step — offer it, but only when the whole queue came from one set.
  const ids = [...new Set(queue.map((i) => i.sessionId))];
  if (ids.length !== 1) return;
  const { studySets } = await bundle();
  const set = setFor(ids[0], studySets);
  if (!set?.quiz?.length) return;
  const n = quickQuizLen(set); // must match what the button actually launches
  paint(
    `<div class="help" style="margin:0 0 10px;text-align:center">You've seen the answers — now try recalling them cold.</div>
     <button class="btn btn-primary btn-block" data-action="quiz-after-review" data-id="${esc(ids[0])}">Take a quick quiz · ${n} question${n === 1 ? "" : "s"}</button>`
  );
}

export function goReturn() {
  setCodingState(null);
  const ret = focusReturn;
  if (typeof ret === "string" && ret.startsWith("set:")) renderSetDetail(ret.slice(4));
  else renderHome();
}

export async function startGlobalReview() {
  const { studySets } = await bundle();
  const items = [];
  studySets.forEach((set) =>
    (set.flashcards || []).forEach((card) => isDue(card) && items.push({ sessionId: set.sessionId, card, examDate: set.examDate }))
  );
  items.sort((a, b) => byDue(a.card, b.card));
  if (!items.length) return toast("Nothing due right now — you're all caught up");
  startReview(items, "home");
}
export async function startSetReview(sessionId) {
  const { studySets } = await bundle();
  const set = setFor(sessionId, studySets);
  // Due cards first; if none are due yet, fall through to studying ahead
  // (still applies SM-2 normally) so the button always does something.
  const due = (set?.flashcards || []).filter((c) => isDue(c));
  const pool = due.length ? due : set?.flashcards || [];
  const items = pool.map((card) => ({ sessionId, card, examDate: set?.examDate }));
  items.sort((a, b) => byDue(a.card, b.card));
  if (!items.length) return toast("This set has no cards yet.");
  startReview(items, "set:" + sessionId);
}


export function applyNext() { qIdx++; paintReviewCard(); }
export function setFocusReturn(v) { focusReturn = v; }
export function setQIdx(v) { qIdx = v; }
