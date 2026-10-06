import { applyNext, paintReviewCard, qIdx, queue, setQIdx } from "../flows/review.js";
import { app, esc, send, toast } from "../core.js";
import { appendReviewLog, bumpActivity, uid } from "../../storage/store.js";
import { bindField, focusEnd, paintShell, primaryBtn, verdictRow, waitRow } from "./shell.js";

export let applyState = null; // { item, hypothetical, phase }
export function setApplyState(v) { applyState = v; }

function shellFor(extra) {
  paintShell({
    mode: "Apply it",
    progress: (qIdx / queue.length) * 100,
    counter: `${qIdx + 1} / ${queue.length}`,
    hasProgress: true,
    ...extra,
  });
}

export async function startApply() {
  const item = queue[qIdx];
  if (!item || !item.card.back) return paintReviewCard();
  const token = Math.random();
  applyState = { item, phase: "loading", token };
  shellFor({ body: waitRow("Writing a fresh scenario…") });
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
  shellFor({
    prompt: hypothetical.scenario,
    promptClass: "text",
    body: `<textarea id="applyAnswer" class="st-field h132 st-mt24" placeholder="Type your answer" aria-label="Your answer"></textarea>
      <div class="st-note">Checked by AI against a hidden rubric.</div>`,
    dock: primaryBtn("apply-check", "Check answer", 'id="applyCheck" disabled'),
  });
  const box = /** @type {HTMLTextAreaElement} */ (document.getElementById("applyAnswer"));
  bindField(box, { btn: /** @type {HTMLButtonElement} */ (document.getElementById("applyCheck")), onSubmit: () => checkApply() });
  focusEnd(box);
}

export async function checkApply() {
  const answer = /** @type {HTMLTextAreaElement|null} */ (document.getElementById("applyAnswer"))?.value.trim();
  if (!answer) return;
  const { item, hypothetical } = applyState;
  const btn = /** @type {HTMLButtonElement|null} */ (app.querySelector('[data-action="apply-check"]'));
  if (!btn || btn.disabled && btn.textContent === "Checking…") return;
  btn.disabled = true;
  btn.textContent = "Checking…";
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
    paintApplyGraded(answer, r.grading);
  } catch (e) {
    toast(e.message);
    btn.disabled = false;
    btn.textContent = "Check answer";
  }
}

function paintApplyGraded(answer, grading) {
  const kind = grading.correct ? "ok" : Number(grading.score) >= 40 ? "part" : "no";
  const label = { ok: "Correct", part: "Partly right", no: "Not quite" }[kind];
  shellFor({
    prompt: applyState.hypothetical.scenario,
    promptClass: "text",
    body: `<div class="st-field h132 static st-mt24 ${kind === "ok" ? "ok" : "amber"}">${esc(answer)}</div>
      <div class="st-mt16">${verdictRow(kind, label)}</div>
      ${grading.feedback ? `<div class="st-feedback mt6">${esc(grading.feedback)}</div>` : ""}`,
    dock: primaryBtn("apply-next", "Next"),
    keys: (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      applyNext();
    },
  });
}
