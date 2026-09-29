import { focusReturn, setFocusReturn } from "../flows/review.js";
import { showChrome } from "../nav.js";
import { XBTN, app, esc, setHTML } from "../core.js";

// ================================================================ QUIZ (focus)
export let quizSet = null,
  quizIdx = 0,
  quizScore = 0;

import { quickQuizLen, shuffled, shuffleQuiz } from "../../../shared/quiz.js";
export { quickQuizLen, shuffled, shuffleQuiz };

export function startQuiz(studySet, ret, limit) {
  // Shuffle first, then slice — a Quick quiz draws a different sample each time.
  const qs = shuffleQuiz(studySet.quiz || []);
  quizSet = { quiz: limit > 0 ? qs.slice(0, limit) : qs };
  quizIdx = 0;
  quizScore = 0;
  setFocusReturn(ret);
  showChrome(false);
  paintQuizQ();
}

export function paintQuizQ() {
  if (quizIdx >= quizSet.quiz.length) return paintQuizDone();
  const q = quizSet.quiz[quizIdx];
  setHTML(app, `
    
      <div class="ahd" style="display:flex;align-items:center;padding:12px;gap:12px">
        <button class="iconbtn" data-action="return-focus" aria-label="End session"><svg class="ic" viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
        <div class="focus-track">
          <div class="focus-fill" style="width:${Math.round((quizIdx / quizSet.quiz.length) * 100)}%"</div>
        </div>
        <div style="font-size:13px;color:var(--text-muted);font-variant-numeric:tabular-nums">${quizIdx + 1} / ${quizSet.quiz.length}</div>
      </div>
    <div class="rev-body">
      <div class="t-label">Multiple choice</div>
      <div style="font-size:16px;font-weight:600;line-height:1.35">${esc(q.q)}</div>
      <div style="display:flex;flex-direction:column;gap:9px" id="opts">
        ${q.options
          .map(
            (o, i) =>
              `<button class="opt" data-action="quiz-opt" data-i="${i}"><span class="key">${String.fromCharCode(65 + i)}</span>${esc(o)}</button>`
          )
          .join("")}
      </div>
    </div>`);
}

export function answerQuiz(i) {
  const q = quizSet.quiz[quizIdx];
  const opts = app.querySelectorAll("#opts .opt");
  opts.forEach((b, bi) => {
    /** @type {HTMLButtonElement} */ (b).disabled = true;
    if (bi === q.answer) b.classList.add("correct");
  });
  if (i === q.answer) quizScore++;
  else opts[i].classList.add("wrong");
  const body = app.querySelector(".rev-body");
  const ex = document.createElement("div");
  ex.className = "explain";
  setHTML(ex, `<b style="color:${i === q.answer ? "var(--status-mastered)" : "var(--danger-text)"}">${
    i === q.answer ? "Correct." : "Not quite."
  }</b> ${esc(q.explain || "")}`);
  body.appendChild(ex);
  const next = document.createElement("button");
  next.className = "btn-primary btn-block";
  next.textContent = quizIdx + 1 >= quizSet.quiz.length ? "See results" : "Next question";
  next.dataset.action = "quiz-next";
  body.appendChild(next);
}

export function paintQuizDone() {
  showChrome(false);
  const pct = Math.round((quizScore / quizSet.quiz.length) * 100);
  setHTML(app, `
    <div class="view">
      <div class="done-msg"><div class="big">${pct >= 80 ? "🌟" : pct >= 50 ? "👍" : "📖"}</div>
        <div style="font-size:30px;font-weight:750;color:var(--text-primary)" class="tnum">${quizScore}/${quizSet.quiz.length}</div>
        <div style="margin-top:4px">${pct}% correct</div>
      </div>
      <button class="btn-primary btn-block" data-action="return-focus">Done</button>
    </div>`);
}


export function quizNext() { quizIdx++; paintQuizQ(); }
