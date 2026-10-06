import { app, bundle, esc, send, setFor, toast } from "../core.js";
import { isDue, review } from "../../../shared/srs.js";
import { setBeforeExit, setFocusReturn } from "../flows/review.js";
import { showChrome } from "../nav.js";
import { appendReviewLog, bumpActivity, uid, updateCard } from "../../storage/store.js";
import { bindField, focusEnd, paintDone, paintShell, primaryBtn, promptClassFor, secondaryBtn, verdictRow } from "./shell.js";

// Type answers: write from memory, an AI grades it against the card, and the
// verdict maps onto the spaced-repetition grade: correct is Good, partly right
// is Hard, wrong or "Don't know" is Again. The grade is saved on Next (or on
// leaving) rather than on Check so "I was right" can still overrule it.
export let typedState = null; // { sessionId, items, idx, token, phase, busy, text, verdict, pending }
export function setTypedState(v) { typedState = v; }

const GRADE = { ok: 4, part: 3, no: 0 };
const LABEL = { ok: "Correct", part: "Partly right", no: "Not quite" };

export async function startTypedPractice(sessionId) {
  const { studySets } = await bundle();
  const set = setFor(sessionId, studySets);
  const cards = (set?.flashcards || []).filter((c) => c.back && !c.deleted);
  if (!cards.length) return toast("This set has no cards yet.");
  const due = cards.filter((c) => isDue(c));
  const items = (due.length ? due : cards).slice(0, 10).map((card) => ({ sessionId, card, examDate: set.examDate }));
  const token = Math.random();
  typedState = { sessionId, items, idx: 0, token, phase: "writing", busy: false, text: "", verdict: null, pending: false };
  setFocusReturn("set:" + sessionId);
  showChrome(false);
  paintTypedQ();
}

function shellFor(s, extra) {
  const { card } = s.items[s.idx];
  paintShell({
    mode: "Type the answer",
    prompt: card.front,
    promptClass: promptClassFor(card.front),
    progress: (s.idx / s.items.length) * 100,
    counter: `${s.idx + 1} / ${s.items.length}`,
    hasProgress: s.idx > 0 || s.phase === "checked",
    ...extra,
  });
}

export function paintTypedQ() {
  const s = typedState;
  if (!s) return;
  if (s.idx >= s.items.length) {
    return paintDone({ mode: "Type answers", title: "Practice complete", detail: `${s.items.length} typed answer${s.items.length === 1 ? "" : "s"} graded.` });
  }
  s.phase = "writing";
  s.busy = false;
  s.text = "";
  s.verdict = null;
  shellFor(s, {
    body: `
      <textarea id="typedAnswer" class="st-field h132 st-mt24" placeholder="Type what you remember" aria-label="Your answer"></textarea>
      <div class="st-note">Checked by AI against the card's answer.</div>`,
    dock: `${secondaryBtn("typed-dontknow", "Don't know")}${primaryBtn("typed-check", "Check answer", 'id="typedCheck" disabled')}`,
  });
  const box = /** @type {HTMLTextAreaElement} */ (document.getElementById("typedAnswer"));
  bindField(box, { btn: /** @type {HTMLButtonElement} */ (document.getElementById("typedCheck")), onSubmit: () => checkTyped() });
  focusEnd(box);
}

function paintChecked() {
  const s = typedState;
  const { card } = s.items[s.idx];
  const v = s.verdict;
  shellFor(s, {
    body: `
      <div class="st-field h132 static st-mt24 ${v.kind === "ok" ? "ok" : "amber"}">${esc(v.dontKnow ? "Don't know" : s.text)}</div>
      <div class="st-mt16">${verdictRow(v.kind, v.dontKnow ? "Not quite" : LABEL[v.kind])}</div>
      ${v.feedback ? `<div class="st-feedback mt6">${esc(v.feedback)}</div>` : ""}
      <div class="st-label caps st-mt24">Card answer</div>
      <div class="st-text15 st-mt8">${esc(card.back)}</div>`,
    dock: `${v.kind === "ok" ? "" : secondaryBtn("typed-right", "I was right")}${primaryBtn("typed-next", "Next")}`,
    keys: (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      typedNext();
    },
  });
}

export async function checkTyped(dontKnow = false) {
  const s = typedState;
  if (!s || s.phase !== "writing" || s.busy) return;
  const answer = /** @type {HTMLTextAreaElement|null} */ (document.getElementById("typedAnswer"))?.value.trim() || "";
  if (!dontKnow && !answer) return;
  s.text = answer;
  if (dontKnow) return showVerdict({ kind: "no", feedback: "", dontKnow: true });

  const { card } = s.items[s.idx];
  const token = s.token;
  s.busy = true;
  app.querySelectorAll(".st-dock button").forEach((b) => { /** @type {HTMLButtonElement} */ (b).disabled = true; });
  const check = document.getElementById("typedCheck");
  if (check) check.textContent = "Checking…";
  try {
    const r = await send({ type: "GRADE_ANSWER", question: card.front, reference: card.back, answer });
    if (!typedState || typedState.token !== token) return;
    const g = r.grading;
    showVerdict({ kind: g.correct ? "ok" : Number(g.score) >= 40 ? "part" : "no", feedback: g.feedback || "" });
  } catch (e) {
    if (!typedState || typedState.token !== token) return;
    s.busy = false;
    toast(e.message);
    app.querySelectorAll(".st-dock button").forEach((b) => { /** @type {HTMLButtonElement} */ (b).disabled = false; });
    if (check) check.textContent = "Check answer";
  }
}

function showVerdict(verdict) {
  const s = typedState;
  s.busy = false;
  s.phase = "checked";
  s.verdict = verdict;
  s.pending = true;
  setBeforeExit(commitTyped);
  paintChecked();
}

/** "I was right": the learner overrules the AI, so the card is graded Good. */
export function typedRight() {
  const s = typedState;
  if (!s || s.phase !== "checked") return;
  s.verdict = { ...s.verdict, kind: "ok", dontKnow: false };
  paintChecked();
}

/** Save the grade once: the schedule moves and the answer is logged. */
async function commitTyped() {
  const s = typedState;
  if (!s || !s.pending) return;
  s.pending = false;
  setBeforeExit(null);
  const { card, sessionId, examDate } = s.items[s.idx];
  const grade = GRADE[s.verdict.kind];
  const prevInterval = card.interval ?? 0;
  const upd = review(card, grade, Date.now(), examDate);
  Object.assign(card, upd);
  await updateCard(sessionId, card.id, upd);
  await Promise.all([
    bumpActivity(1),
    appendReviewLog({
      kind: "typed", stability: upd.stability, difficulty: upd.difficulty,
      id: uid(), cardId: card.id, sessionId, grade,
      prevInterval, newInterval: upd.interval, reviewedAt: new Date().toISOString(),
    }),
  ]);
}

export async function typedNext() {
  const s = typedState;
  if (!s || s.phase !== "checked") return;
  s.phase = "saving"; // one Enter, one card
  await commitTyped();
  s.idx++;
  paintTypedQ();
}
