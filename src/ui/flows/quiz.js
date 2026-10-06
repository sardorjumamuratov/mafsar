import { focusReturn, setFocusReturn } from "../flows/review.js";
import { showChrome } from "../nav.js";
import { app, esc, setHTML } from "../core.js";
import { quickQuizLen, shuffled, shuffleQuiz } from "../../../shared/quiz.js";
import { paintShell } from "./shell.js";

export { quickQuizLen, shuffled, shuffleQuiz };

// ================================================================ QUIZ (focus)
export let quizSet = null,
  quizIdx = 0,
  quizScore = 0;

export function startQuiz(studySet, ret, limit) {
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
  const progress = (quizIdx / quizSet.quiz.length) * 100;
  
  const body = `
    <div id="opts" style="margin-top:24px;display:flex;flex-direction:column;gap:8px">
      ${q.options.map((o, i) => `
        <button class="opt" data-action="quiz-opt" data-i="${i}" style="width:100%;min-height:56px;padding:12px 14px;border-radius:12px;border:1px solid var(--border-card,#222c2a);background:var(--bg-surface,#141d1b);display:flex;align-items:center;gap:12px;cursor:pointer;text-align:left">
          <div class="key-tile" style="width:28px;height:28px;border-radius:8px;border:1px solid var(--border-control,#27322f);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:650;color:var(--text-secondary,#cfd9d6);flex-shrink:0">${String.fromCharCode(65 + i)}</div>
          <div style="font-size:15px;line-height:1.4;color:var(--text-primary,#e7eeec)">${esc(o)}</div>
        </button>
      `).join("")}
    </div>
    <div id="quizFeedback"></div>
  `;
  
  const dock = `
    <div id="quizDock" style="height:60px;display:flex;align-items:center;justify-content:center;font-size:13px;color:var(--text-muted,#9aa9a4);width:100%">Pick an answer, or press A–D</div>
  `;
  
  setHTML(app, paintShell({
    mode: "Quiz",
    prompt: q.q,
    progress,
    counter: `${quizIdx + 1} / ${quizSet.quiz.length}`,
    body,
    dock,
    promptClass: "prompt-full"
  }));
}

export function answerQuiz(i) {
  const q = quizSet.quiz[quizIdx];
  const opts = app.querySelectorAll("#opts .opt");
  opts.forEach((el, bi) => {
    const b = /** @type {HTMLElement & {disabled: boolean}} */ (el);
    b.disabled = true;
    b.style.cursor = "default";
    const tile = /** @type {HTMLElement} */ (b.querySelector('.key-tile'));
    if (bi === q.answer) {
      b.style.borderColor = "var(--accent,#34bcad)";
      if (tile) {
        tile.style.border = "1px solid var(--accent,#34bcad)";
        tile.style.background = "var(--accent,#34bcad)";
        tile.style.color = "var(--accent-on,#04211d)";
        tile.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" stroke-width="3" style="stroke:currentColor;fill:none;stroke-linecap:round;stroke-linejoin:round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
      }
    } else if (bi === i) {
      b.style.borderColor = "#e3a246";
      if (tile) {
        tile.style.border = "1px solid #e3a246";
        tile.style.background = "#e3a246";
        tile.style.color = "var(--accent-on,#04211d)";
        tile.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" stroke-width="3" style="stroke:currentColor;fill:none;stroke-linecap:round;stroke-linejoin:round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
      }
    } else {
      b.style.opacity = "0.45";
    }
  });
  
  if (i === q.answer) quizScore++;
  
  const feedbackEl = document.getElementById("quizFeedback");
  if (feedbackEl) {
    feedbackEl.style.marginTop = "16px";
    feedbackEl.style.fontSize = "15px";
    feedbackEl.style.lineHeight = "1.5";
    feedbackEl.style.color = "var(--text-muted,#9aa9a4)";
    const lead = i === q.answer 
      ? `<span style="color:var(--accent-text,#5fd3c5);font-weight:650">Correct.</span>`
      : `<span style="color:#e3a246;font-weight:650">Not quite.</span>`;
    feedbackEl.innerHTML = `${lead} ${esc(q.explain || "")}`;
  }
  
  const dock = document.getElementById("quizDock");
  if (dock) {
    const nextText = quizIdx + 1 >= quizSet.quiz.length ? "See results" : "Next question";
    dock.outerHTML = `<button data-action="quiz-next" style="width:100%;height:60px;border-radius:14px;background:var(--accent,#34bcad);color:var(--accent-on,#04211d);font-size:16px;font-weight:650;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center">${nextText}</button>`;
  }
}

export function paintQuizDone() {
  showChrome(false);
  const pct = Math.round((quizScore / quizSet.quiz.length) * 100);
  setHTML(app, `
    <div class="view">
      <div class="done-msg"><div class="big">${pct >= 80 ? "🏆" : pct >= 50 ? "👍" : "🤔"}</div>
        <div style="font-size:30px;font-weight:750;color:var(--text-primary)" class="tnum">${quizScore}/${quizSet.quiz.length}</div>
        <div style="margin-top:4px">${pct}% correct</div>
      </div>
      <button class="btn btn-primary btn-block" data-action="return-focus">Done</button>
    </div>`);
}

export function quizNext() { quizIdx++; paintQuizQ(); }
