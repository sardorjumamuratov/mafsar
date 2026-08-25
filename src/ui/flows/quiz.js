import { focusReturn, setFocusReturn } from "../flows/review.js";
import { showChrome } from "../nav.js";
import { XBTN, app, esc, setHTML } from "../core.js";

// ================================================================ QUIZ (focus)
export let quizSet = null,
  quizIdx = 0,
  quizScore = 0;

/** Default quiz length: ~10% of a big set, the whole thing for a small one. */
export function quickQuizLen(studySet) {
  const total = studySet.flashcards?.length || 0;
  const available = studySet.quiz?.length || 0;
  if (total < 20) return available;
  return Math.max(1, Math.min(available, Math.round(total * 0.1)));
}

/** Fisher-Yates on a copy. */
export function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Randomize question order AND option order for one sitting. The stored quiz is
 * untouched — models tend to park the correct answer in the same slot, so
 * without this the answer key is learnable instead of the material.
 */
export function shuffleQuiz(questions) {
  return shuffled(questions).map((q) => {
    const order = shuffled(q.options.map((_, i) => i));
    return { ...q, options: order.map((i) => q.options[i]), answer: order.indexOf(q.answer) };
  });
}

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
    <div class="rev-top">${XBTN}<div class="bar"><i style="width:${Math.round((quizIdx / quizSet.quiz.length) * 100)}%"></i></div>
      <span class="rev-count tnum">${quizIdx + 1} / ${quizSet.quiz.length}</span></div>
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
  setHTML(ex, `<b style="color:${i === q.answer ? "var(--success)" : "var(--danger)"}">${
    i === q.answer ? "Correct." : "Not quite."
  }</b> ${esc(q.explain || "")}`);
  body.appendChild(ex);
  const next = document.createElement("button");
  next.className = "btn btn-primary btn-block";
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
        <div style="font-size:30px;font-weight:750;color:var(--ink)" class="tnum">${quizScore}/${quizSet.quiz.length}</div>
        <div style="margin-top:4px">${pct}% correct</div>
      </div>
      <button class="btn btn-primary btn-block" data-action="return-focus">Done</button>
    </div>`);
}


export function quizNext() { quizIdx++; paintQuizQ(); }
