import { XBTN, app, bundle, esc, send, setFor, setHTML, toast } from "../core.js";
import { isDue, review } from "../../storage/srs.js";
import { goReturn, setFocusReturn } from "../flows/review.js";
import { showChrome } from "../nav.js";
import { MAX_CODE_CHARS, codeSize } from "../../storage/coding.js";
import { appendReviewLog, bumpActivity, uid } from "../../storage/store.js";

export let codingState = null; // { sessionId, items, idx, task }

export async function startCodingPractice(sessionId) {
  const { studySets } = await bundle();
  const set = setFor(sessionId, studySets);
  const cards = (set?.flashcards || []).filter((c) => c.back);
  if (!cards.length) return toast("This set has no cards to practise with yet.");
  const due = cards.filter((c) => isDue(c));
  const items = (due.length ? due : cards).slice(0, 5).map((card) => ({ sessionId, card }));
  codingState = { sessionId, items, idx: 0, task: null };
  setFocusReturn("set:" + sessionId);
  showChrome(false);
  paintCodingQ();
}

export function paintCodingQ() {
  const { items, idx } = codingState;
  if (idx >= items.length) {
    setHTML(app, `
      <div class="view">
        <div class="done-msg"><div class="big">⌨️</div>
          <div style="font-weight:650;color:var(--ink)">Coding practice complete</div>
          <div style="margin-top:4px">${items.length} exercise${items.length === 1 ? "" : "s"} graded.</div>
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
      <div class="t-label">Solve in code</div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
        <span class="spinner" style="border-color:var(--border);border-top-color:var(--primary)"></span>
        <span style="font-size:13px;color:var(--muted)">Writing a small exercise from “${esc(card.front)}”…</span>
      </div>
    </div>`);
  requestCodingTask();
}

// A token per sitting: a slow LLM response must not paint over a session the
// user restarted or left (goReturn nulls codingState).
export async function requestCodingTask() {
  const { items, idx } = codingState;
  const token = (codingState.token = {});
  try {
    const r = await send({
      type: "GENERATE_CODING_TASK",
      concept: items[idx].card.front,
      reference: items[idx].card.back,
    });
    if (!codingState || codingState.token !== token) return;
    codingState.task = r.task;
    paintCodeEditor();
  } catch (e) {
    if (!codingState || codingState.token !== token) return;
    toast(e.message);
    codingState.idx++;
    paintCodingQ();
  }
}

export function paintCodeEditor() {
  const { task, items, idx } = codingState;
  setHTML(app, `
    <div class="rev-top">${XBTN}<div class="bar"><i style="width:${Math.round((idx / items.length) * 100)}%"></i></div>
      <span class="rev-count tnum">${idx + 1} / ${items.length}</span></div>
    <div class="rev-body">
      <div class="t-label">Solve in code · ${esc(task.language)}</div>
      <div class="hypothetical">${esc(task.scenario)}</div>
      <div class="checklist" aria-label="Requirements">
        ${task.rubric.map((r) => `<div class="ck"><span class="box"></span><span>${esc(r)}</span></div>`).join("")}
      </div>
      <textarea id="codeInput" class="code-input" spellcheck="false" autocapitalize="off"
        autocomplete="off" rows="10" aria-describedby="codeMeta">${esc(task.starter)}</textarea>
      <div class="code-meta" id="codeMeta">
        <span class="target">About ${task.expectedLines} lines</span>
        <span class="count tnum" id="codeCount"></span>
      </div>
      <button class="btn btn-primary btn-block" data-action="code-check">Submit for review</button>
    </div>`);

  const ta = document.getElementById("codeInput");
  // Tab indents instead of leaving the field — in a code box the browser
  // default is the wrong behavior. Shift+Tab still escapes for keyboard users.
  ta.addEventListener("keydown", (e) => {
    if (e.key !== "Tab" || e.shiftKey) return;
    e.preventDefault();
    const { selectionStart: a, selectionEnd: b, value } = /** @type {HTMLInputElement} */ (ta);
    /** @type {HTMLInputElement} */ (ta).value = value.slice(0, a) + "  " + value.slice(b);
    /** @type {HTMLInputElement} */ (ta).selectionStart = /** @type {HTMLInputElement} */ (ta).selectionEnd = a + 2;
    paintCodeCount();
  });
  ta.addEventListener("input", paintCodeCount);
  paintCodeCount();
  ta.focus();
  /** @type {HTMLInputElement} */ (ta).selectionStart = /** @type {HTMLInputElement} */ (ta).selectionEnd = /** @type {HTMLInputElement} */ (ta).value.length;
}

/** Live counter. The cap disables submit; the target never does. */
export function paintCodeCount() {
  const ta = document.getElementById("codeInput");
  const out = document.getElementById("codeCount");
  const btn = app.querySelector('[data-action="code-check"]');
  if (!ta || !out || !btn) return;
  const s = codeSize(/** @type {HTMLInputElement} */ (ta).value, codingState.task.expectedLines);

  out.textContent = s.overCap
    ? `${s.chars} / ${s.cap} characters — too long to submit`
    : `${s.lines} line${s.lines === 1 ? "" : "s"}${s.verbose ? " · longer than needed" : ""}`;
  out.classList.toggle("over", s.overCap);
  out.classList.toggle("warn", !s.overCap && s.verbose);
  /** @type {HTMLButtonElement} */ (btn).disabled = s.overCap || s.empty;
}

export async function checkCode() {
  if (!codingState?.task) return toast("Practice stopped.");
  const ta = document.getElementById("codeInput");
  const { items, idx, task, sessionId } = codingState;
  const { card } = items[idx];
  const s = codeSize(/** @type {HTMLInputElement} */ (ta)?.value, task.expectedLines);
  if (s.empty) return toast("Write some code first.");
  if (s.overCap) return toast(`That\'s too long — keep it under ${MAX_CODE_CHARS} characters.`);

  const btn = app.querySelector('[data-action="code-check"]');
  /** @type {HTMLButtonElement} */ (btn).disabled = true;
  btn.textContent = "Reviewing…";
  try {
    const r = await send({
      type: "GRADE_CODING",
      task: task.scenario,
      rubric: task.rubric,
      language: task.language,
      expectedLines: task.expectedLines,
      code: /** @type {HTMLInputElement} */ (ta).value,
    });
    if (!codingState || codingState.task !== task) return;
    await Promise.all([
      bumpActivity(1),
      appendReviewLog({
        id: uid(), cardId: card.id, sessionId,
        grade: r.grading.correct ? 4 : 1, prevInterval: 0, newInterval: 0,
        reviewedAt: new Date().toISOString(),
      }),
    ]);
    paintCodeGraded(r.grading);
  } catch (e) {
    toast(e.message);
    /** @type {HTMLButtonElement} */ (btn).disabled = false;
    btn.textContent = "Submit for review";
  }
}

/**
 * Per-requirement checklist rather than one number: for code the useful signal
 * is WHICH requirement failed. Conciseness is reported, never punished on its
 * own — a correct-but-long solution still reads as correct.
 */
export function paintCodeGraded(g) {
  const box = document.createElement("div");
  box.className = "graded";
  setHTML(box, `
    <div class="score-row">
      <div class="score tnum ${g.correct ? "ok" : "no"}">${g.score}</div>
      <div><b style="color:${g.correct ? "var(--success)" : "var(--danger)"}">${g.correct ? "Passes" : "Not yet"}</b>
        <div class="feedback">${esc(g.feedback)}</div></div>
    </div>
    <div class="checklist graded-ck">
      ${(g.meets || [])
        .map(
          (m) =>
            `<div class="ck ${m.met ? "met" : "unmet"}"><span class="box">${m.met ? "✓" : "✕"}</span>
               <span><b>${esc(m.requirement)}</b>${m.note ? `<span class="note">${esc(m.note)}</span>` : ""}</span></div>`
        )
        .join("")}
    </div>
    ${
      g.conciseness
        ? `<div class="conciseness"><b>${g.conciseness.actual} lines</b> · about ${g.conciseness.expected} expected${
            g.conciseness.note ? ` — ${esc(g.conciseness.note)}` : ""
          }</div>`
        : ""
    }
    <button class="btn btn-primary btn-block" data-action="code-next">Continue</button>`);
  const body = app.querySelector(".rev-body");
  if (body) {
    body.querySelector(".code-input")?.remove();
    body.querySelector(".code-meta")?.remove();
    body.querySelector(".checklist")?.remove();
    body.querySelector('[data-action="code-check"]')?.remove();
    body.appendChild(box);
  }
}

// --- Typed-answer practice over a set's cards (AI assessment) ---------------

export function codingNext() { codingState.idx++; paintCodingQ(); }
export function setCodingState(v) { codingState = v; }
