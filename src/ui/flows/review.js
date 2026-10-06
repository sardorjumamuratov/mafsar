import { showChrome } from "../nav.js";
import { byDue, isDue, review } from "../../../shared/srs.js";
import { bundle, esc, setFor, toast } from "../core.js";
import { appendReviewLog, bumpActivity, uid, updateCard } from "../../storage/store.js";
import { syncNow } from "../../sync/sync.js";
import { quickQuizLen } from "../flows/quiz.js";
import { setCodingState } from "../flows/coding.js";
import { setTeachState } from "./teach.js";
import { setDesignState } from "./design.js";
import { setEstimationState } from "./estimation.js";
import { setBottleneckState } from "./bottleneck.js";
import { setCompareState } from "./compare.js";
import { setTypedState } from "./typed.js";
import { setApplyState } from "./apply.js";
import { renderSetDetail } from "../views/set-detail.js";
import { renderHome } from "../views/home.js";
import { confirmSheet } from "../confirm.js";
import { icon, paintDone, paintShell, primaryBtn, promptClassFor, secondaryBtn, typing } from "./shell.js";

// ================================================================ REVIEW (focus)
export let queue = [],
  qIdx = 0,
  focusReturn = "home";
export const reviewedIds = new Set();
let cardStartMs = 0;
let grading = false;

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

const GRADES = [["Again", 0], ["Hard", 3], ["Good", 4], ["Easy", 5]];

function reviewShell(extra) {
  const { card } = queue[qIdx];
  paintShell({
    mode: "Flashcards",
    prompt: card.front,
    promptClass: promptClassFor(card.front),
    progress: (qIdx / queue.length) * 100,
    counter: `${qIdx + 1} / ${queue.length}`,
    hasProgress: qIdx > 0,
    ...extra,
  });
}

export function paintReviewCard() {
  cardStartMs = Date.now();
  grading = false;
  if (qIdx >= queue.length) return paintReviewDone();
  reviewShell({
    body: `<div class="st-help">Recall the answer, then reveal it.</div>`,
    dock: primaryBtn("flip", "Show answer"),
    keys: (e) => {
      if (typing(e) || e.key !== " ") return;
      e.preventDefault();
      revealCard();
    },
  });
}

export function revealCard() {
  const item = queue[qIdx];
  if (!item) return;
  const { card } = item;
  reviewShell({
    body: `
      <div class="st-rule"></div>
      <div class="st-answer">${esc(card.back || "—")}</div>
      <button type="button" class="st-link st-mt20" data-action="apply-card">Apply it in a new scenario ${icon("arrowRight", 16)}</button>`,
    dock: `<div class="st-grades">${GRADES.map(([label, g]) => `
        <button type="button" class="st-grade" data-action="grade" data-g="${g}">
          <span class="l">${label}</span><span class="i">${gradePreview(card, g, item.examDate)}d</span>
        </button>`).join("")}</div>`,
    keys: (e) => {
      const n = Number(e.key);
      if (typing(e) || !(n >= 1 && n <= 4)) return;
      e.preventDefault();
      gradeCard(GRADES[n - 1][1]);
    },
  });
}

export async function gradeCard(g) {
  const item = queue[qIdx];
  // A held key or a double tap must not grade the same card twice.
  if (!item || grading) return;
  grading = true;
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
  const paint = (extra = "", dock) => paintDone({
    mode: "Flashcards",
    title: "Review complete",
    detail: `${reviewed} card${reviewed === 1 ? "" : "s"} reviewed.`,
    extra,
    dock,
  });
  paint();
  const ids = [...new Set(queue.map((i) => i.sessionId))];
  if (ids.length !== 1) return;
  const { studySets } = await bundle();
  const set = setFor(ids[0], studySets);
  if (!set?.quiz?.length) return;
  const n = quickQuizLen(set);
  paint(
    `<div class="st-help">You've seen the answers. Now try recalling them cold.</div>`,
    `${secondaryBtn("return-focus", "Done")}${primaryBtn("quiz-after-review", `Take a quick quiz · ${n} question${n === 1 ? "" : "s"}`, `data-id="${esc(ids[0])}"`)}`
  );
}

export function goReturn() {
  setCodingState(null);
  setTeachState(null);
  setDesignState(null);
  setEstimationState(null);
  setBottleneckState(null);
  setCompareState(null);
  setTypedState(null);
  setApplyState(null);
  const ret = focusReturn;
  if (typeof ret === "string" && ret.startsWith("set:")) renderSetDetail(ret.slice(4));
  else renderHome();
}

// A mode that holds a result it hasn't saved yet (a checked typed answer the
// learner may still overrule) registers a flush here, so leaving never loses it.
let beforeExit = null;
export function setBeforeExit(fn) { beforeExit = fn; }

/** The close button on a study screen: asks first when the session has progress to lose. */
export async function exitStudy(btn) {
  if (btn?.dataset?.progress === "1") {
    const leave = await confirmSheet({
      title: "End this session?",
      body: "You can start another any time.",
      confirmLabel: "End session",
      cancelLabel: "Keep going",
    });
    if (!leave) return;
  }
  if (beforeExit) {
    const flush = beforeExit;
    beforeExit = null;
    await flush().catch(() => {});
  }
  goReturn();
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
