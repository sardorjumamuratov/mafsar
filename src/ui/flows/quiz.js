import { setFocusReturn } from "../flows/review.js";
import { showChrome } from "../nav.js";
import { esc } from "../core.js";
import { quickQuizLen, shuffled, shuffleQuiz } from "../../../shared/quiz.js";
import { icon, paintDone, paintShell, primaryBtn, typing } from "./shell.js";

export { quickQuizLen, shuffled, shuffleQuiz };

// ================================================================ QUIZ (focus)
export let quizSet = null,
  quizIdx = 0,
  quizScore = 0;
let picked = null; // index the learner chose on this question, null until they answer

export function startQuiz(studySet, ret, limit) {
  const qs = shuffleQuiz(studySet.quiz || []);
  quizSet = { quiz: limit > 0 ? qs.slice(0, limit) : qs };
  quizIdx = 0;
  quizScore = 0;
  picked = null;
  setFocusReturn(ret);
  showChrome(false);
  paintQuizQ();
}

function optionHtml(o, i, q) {
  const key = String.fromCharCode(65 + i);
  let cls = "";
  let tile = key;
  if (picked !== null) {
    if (i === q.answer) { cls = " right"; tile = icon("check", 16, 3); }
    else if (i === picked) { cls = " wrong"; tile = icon("close", 14, 3); }
    else cls = " dim";
  }
  return `<button type="button" class="st-opt${cls}" data-action="quiz-opt" data-i="${i}"${picked !== null ? " disabled" : ""}>
      <span class="key">${tile}</span><span class="txt">${esc(o)}</span>
    </button>`;
}

export function paintQuizQ() {
  if (quizIdx >= quizSet.quiz.length) return paintQuizDone();
  const q = quizSet.quiz[quizIdx];
  const answered = picked !== null;
  const right = picked === q.answer;
  const last = quizIdx + 1 >= quizSet.quiz.length;
  const scroll = document.getElementById("stBody")?.scrollTop || 0;
  paintShell({
    mode: "Quiz",
    prompt: q.q,
    promptClass: "q",
    progress: (quizIdx / quizSet.quiz.length) * 100,
    counter: `${quizIdx + 1} / ${quizSet.quiz.length}`,
    hasProgress: quizIdx > 0 || answered,
    body: `
      <div class="st-opts">${q.options.map((o, i) => optionHtml(o, i, q)).join("")}</div>
      ${answered ? `<div class="st-quizfb"><b class="${right ? "ok" : "amber"}">${right ? "Correct." : "Not quite."}</b> ${esc(q.explain || "")}</div>` : ""}`,
    dock: answered
      ? primaryBtn("quiz-next", last ? "See results" : "Next question")
      : `<div class="st-dock-note">Pick an answer, or press A–D</div>`,
    keys: (e) => {
      if (typing(e) || e.ctrlKey || e.metaKey) return;
      if (picked !== null) {
        if (e.key !== "Enter") return;
        e.preventDefault();
        quizNext();
        return;
      }
      const i = e.key.length === 1 ? e.key.toUpperCase().charCodeAt(0) - 65 : -1;
      if (i < 0 || i >= q.options.length) return;
      e.preventDefault();
      answerQuiz(i);
    },
  });
  const body = document.getElementById("stBody");
  if (body && scroll) body.scrollTop = scroll;
}

export function answerQuiz(i) {
  if (picked !== null) return; // options lock once answered
  const q = quizSet.quiz[quizIdx];
  picked = i;
  if (i === q.answer) quizScore++;
  paintQuizQ();
}

export function paintQuizDone() {
  showChrome(false);
  const n = quizSet.quiz.length;
  const pct = Math.round((quizScore / n) * 100);
  paintDone({ mode: "Quiz", title: "Quiz complete", detail: `${quizScore} of ${n} correct · ${pct}%` });
}

export function quizNext() {
  if (picked === null) return;
  picked = null;
  quizIdx++;
  paintQuizQ();
}
