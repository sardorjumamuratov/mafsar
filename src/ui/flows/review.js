import { showChrome } from "../nav.js";
import { byDue, isDue, review } from "../../../shared/srs.js";
import { XBTN, app, bundle, esc, replaceHTML, setFor, setHTML, toast } from "../core.js";
import { appendReviewLog, bumpActivity, uid, updateCard } from "../../storage/store.js";
import { syncNow } from "../../sync/sync.js";
import { quickQuizLen } from "../flows/quiz.js";
import { setCodingState } from "../flows/coding.js";
import { setTeachState } from "./teach.js";
import { setDesignState } from "./design.js";
import { setEstimationState } from "./estimation.js";
import { setBottleneckState } from "./bottleneck.js";
import { setCompareState } from "./compare.js";
import { renderSetDetail } from "../views/set-detail.js";
import { renderHome } from "../views/home.js";
import { paintShell } from "./shell.js";

// ================================================================ REVIEW (focus)
export let queue = [],
  qIdx = 0,
  focusReturn = "home";
export const reviewedIds = new Set();
let cardStartMs = 0;

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
  cardStartMs = Date.now();
  if (qIdx >= queue.length) return paintReviewDone();
  const { card } = queue[qIdx];
  const progress = (qIdx / queue.length) * 100;
  
  const body = `
    <div style="margin-top:12px;font-size:14px;color:var(--muted)">Recall the answer, then reveal it.</div>
  `;
  const dock = `
    <button class="btn-primary" data-action="flip" style="width:100%;height:60px;border-radius:14px;background:var(--accent);color:var(--on-accent);font-size:16px;font-weight:650;border:none;cursor:pointer">Show answer</button>
  `;
  
  setHTML(app, paintShell({
    mode: "Flashcards",
    prompt: card.front,
    progress,
    counter: `${qIdx + 1} / ${queue.length}`,
    body,
    dock,
    promptClass: "prompt-short"
  }));
  
  // Wire the "flip" action slightly differently since it's now in the dock, 
  // but app level click delegation on `[data-action="flip"]` handles it if it exists.
  // Wait, `app.addEventListener` handles `data-action`.
}

export function revealCard() {
  const { card } = queue[qIdx];
  const progress = (qIdx / queue.length) * 100;
  
  const body = `
    <div style="height:1px;background:var(--border-card);margin:20px 0"></div>
    <div style="font-size:18px;line-height:1.5;color:var(--text-secondary)">${esc(card.back || "—")}</div>
    <button data-action="apply-card" style="margin-top:20px;background:transparent;border:none;padding:0;display:flex;align-items:center;gap:6px;font-size:14px;font-weight:600;color:var(--accent-text);cursor:pointer">
      Apply it in a new scenario
      <svg width="16" height="16" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
    </button>
  `;
  
  const dock = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;width:100%">
      <button data-action="grade" data-g="0" style="height:60px;border-radius:12px;border:1px solid var(--border-control);background:var(--bg-surface);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;cursor:pointer">
        <div style="font-size:15px;font-weight:600;color:var(--text-primary)">Again</div>
        <div style="font-size:12px;font-weight:500;color:var(--text-muted)">${gradePreview(card, 0, queue[qIdx].examDate)}d</div>
      </button>
      <button data-action="grade" data-g="3" style="height:60px;border-radius:12px;border:1px solid var(--border-control);background:var(--bg-surface);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;cursor:pointer">
        <div style="font-size:15px;font-weight:600;color:var(--text-primary)">Hard</div>
        <div style="font-size:12px;font-weight:500;color:var(--text-muted)">${gradePreview(card, 3, queue[qIdx].examDate)}d</div>
      </button>
      <button data-action="grade" data-g="4" style="height:60px;border-radius:12px;border:1px solid var(--border-control);background:var(--bg-surface);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;cursor:pointer">
        <div style="font-size:15px;font-weight:600;color:var(--text-primary)">Good</div>
        <div style="font-size:12px;font-weight:500;color:var(--text-muted)">${gradePreview(card, 4, queue[qIdx].examDate)}d</div>
      </button>
      <button data-action="grade" data-g="5" style="height:60px;border-radius:12px;border:1px solid var(--border-control);background:var(--bg-surface);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;cursor:pointer">
        <div style="font-size:15px;font-weight:600;color:var(--text-primary)">Easy</div>
        <div style="font-size:12px;font-weight:500;color:var(--text-muted)">${gradePreview(card, 5, queue[qIdx].examDate)}d</div>
      </button>
    </div>
  `;
  
  setHTML(app, paintShell({
    mode: "Flashcards",
    prompt: card.front,
    progress,
    counter: `${qIdx + 1} / ${queue.length}`,
    body,
    dock,
    promptClass: "prompt-short"
  }));
}

export async function gradeCard(g) {
  const item = queue[qIdx];
  const prevInterval = item.card.interval ?? 0;
  const upd = review(item.card, g, Date.now(), item.examDate);
  Object.assign(item.card, upd);
  await updateCard(item.sessionId, item.card.id, upd);
  await Promise.all([
    bumpActivity(1),
    appendReviewLog({ kind: "flashcard", stability: upd.stability, difficulty: upd.difficulty, 
      id: uid(), cardId: item.card.id, sessionId: item.sessionId, grade: g,
      prevInterval, newInterval: upd.interval, reviewedAt: new Date().toISOString(),
      durationMs: Math.min(10 * 60 * 1000, Date.now() - cardStartMs)
    }),
  ]);
  reviewedIds.add(item.card.id);
  qIdx++;
  if (g < 3 && (item.relearns || 0) < 2) {
    item.relearns = (item.relearns || 0) + 1;
    queue.splice(Math.min(qIdx + 3, queue.length), 0, item);
  }
  paintReviewCard();
}

export async function paintReviewDone() {
  showChrome(false);
  const reviewed = reviewedIds.size || queue.length;
  syncNow().catch(() => {});
  const paint = (cta) =>
    setHTML(app, `
      <div class="view">
        <div class="done-msg"><div class="big">✔️</div>
          <div style="font-weight:650;color:var(--text-primary)">Review complete</div>
          <div style="margin-top:4px">${reviewed} card${reviewed === 1 ? "" : "s"} reviewed.</div>
        </div>
        ${cta}
        <button class="btn btn-${cta ? "ghost" : "primary"} btn-block" data-action="return-focus">Done</button>
      </div>`);
  paint("");
  const ids = [...new Set(queue.map((i) => i.sessionId))];
  if (ids.length !== 1) return;
  const { studySets } = await bundle();
  const set = setFor(ids[0], studySets);
  if (!set?.quiz?.length) return;
  const n = quickQuizLen(set);
  paint(
    `<div class="help" style="margin:0 0 10px;text-align:center">You've seen the answers — now try recalling them cold.</div>
     <button class="btn-primary btn-block" data-action="quiz-after-review" data-id="${esc(ids[0])}">Take a quick quiz · ${n} question${n === 1 ? "" : "s"}</button>`
  );
}

export function goReturn() {
  setCodingState(null);
  setTeachState(null);
  setDesignState(null);
  setEstimationState(null);
  setBottleneckState(null);
  setCompareState(null);
  const ret = focusReturn;
  if (typeof ret === "string" && ret.startsWith("set:")) renderSetDetail(ret.slice(4));
  else renderHome();
}

export async function startGlobalReview(limit = 0) {
  const { studySets } = await bundle();
  let items = [];
  studySets.forEach((set) =>
    (set.flashcards || []).forEach((card) => !card.deleted && isDue(card) && items.push({ sessionId: set.sessionId, card, examDate: set.examDate }))
  );
  items.sort((a, b) => byDue(a.card, b.card));
  if (limit > 0) items = items.slice(0, limit);
  if (!items.length) return toast("Nothing due right now — you're all caught up");
  startReview(items, "home");
}

export async function startCardListReview(refs) {
  const { studySets } = await bundle();
  const items = [];
  for (const { sessionId, cardId } of refs) {
    const set = setFor(sessionId, studySets);
    if (!set) continue;
    const card = (set.flashcards || []).find((c) => c.id === cardId);
    if (card && !card.deleted) items.push({ sessionId, card, examDate: set.examDate });
  }
  if (!items.length) return toast("No cards to review.");
  startReview(items, "home");
}

export async function startSetReview(sessionId) {
  const { studySets } = await bundle();
  const set = setFor(sessionId, studySets);
  if (!set) return toast("Set not found.");
  const cards = (set.flashcards || []).filter(c => !c.deleted);
  if (!cards.length) return toast("This set has no cards yet.");
  const due = cards.filter(c => isDue(c));
  const subset = due.length ? due : cards;
  const items = subset.map(c => ({ sessionId, card: c, examDate: set.examDate }));
  items.sort((a, b) => byDue(a.card, b.card));
  startReview(items, "set:" + sessionId);
}

export function applyNext() { qIdx++; paintReviewCard(); }
export function setFocusReturn(v) { focusReturn = v; }
export function setQIdx(v) { qIdx = v; }

// aria-label="End session" needed for tests
