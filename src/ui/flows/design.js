import { XBTN, app, bundle, esc, send, setFor, setHTML, toast } from "../core.js";
import { setFocusReturn } from "../flows/review.js";
import { showChrome } from "../nav.js";
import { appendReviewLog, bumpActivity, uid } from "../../storage/store.js";
import { drillLogEntry } from "../../storage/drill-log.js";
import {
  CLINICAL_SECTIONS, MAX_CURVEBALLS, MAX_DESIGN_CHARS, SECTIONS, answerTooLong, assembleAnswer, drillScore, emptySections,
} from "../../storage/design.js";

/** Wording differs between a design drill and a Medicine clinical case. */
const COPY = {
  design: {
    flow: "Design drill", brief: "Design brief", answer: "Your design", writing: "Writing a brief…",
    grading: "Reviewing your design…", submit: "Submit design", empty: "Write at least one section.",
    turn: "Curveball", turnAsk: "How your design changes", turnHint: "What changes in your design, and why?",
    turnBtn: "Take a curveball", done: "Drill complete", score: "Rubric coverage",
    scoreHint: "First design counts double, each curveball once.",
  },
  clinical: {
    flow: "Clinical case", brief: "The case", answer: "Your assessment", writing: "Writing a case…",
    grading: "Reviewing your assessment…", submit: "Submit assessment", empty: "Write your leading diagnosis first.",
    turn: "Results", turnAsk: "Your final diagnosis and management", turnHint: "Diagnosis now, and the first-line management.",
    turnBtn: "See the results", done: "Case complete", score: "Reasoning covered",
    scoreHint: "Your first assessment counts double, the final answer once.",
  },
};

// Design drill (System design sets): brief → sectioned answer → rubric feedback
// → up to MAX_CURVEBALLS curveballs → summary. One sitting's state; goReturn() nulls it.
// { sessionId, topic, cards, brief, rubric, sections, grading, curveballs: [{ question, answer, grading }], logged, token }
export let designState = null;
export function setDesignState(v) { designState = v; }

export async function startDesignDrill(sessionId, forceMode) {
  const { sessions, studySets } = await bundle();
  const set = setFor(sessionId, studySets);
  const cards = (set?.flashcards || []).filter((c) => c.front && c.back).slice(0, 50);
  if (!cards.length) return toast("This set has no cards to build a brief from yet.");
  const session = sessions.find((s) => s.id === sessionId);
  designState = {
    sessionId,
    topic: String(session?.title || set?.title || "this topic").slice(0, 200),
    cards: cards.map((c) => ({ front: String(c.front).slice(0, 500), back: String(c.back).slice(0, 2000) })),
    brief: null,
    rubric: [],
    mode: forceMode || "design",
    sections: emptySections(forceMode || "design"),
    grading: null,
    curveballs: [],
    logged: false,
    token: null,
  };
  setFocusReturn("set:" + sessionId);
  showChrome(false);
  const s = designState;
  paintLoader(COPY[s.mode].writing);
  const token = (s.token = {});
  try {
    const res = await send({ type: "DESIGN_TASK", concept: s.topic, reference: s.cards, mode: s.mode });
    if (designState !== s || s.token !== token) return;
    s.brief = res.brief;
    s.encryptedState = res.state;
    s.rubric = Array.isArray(res.rubric) ? res.rubric : [];
    paintForm();
  } catch (e) {
    if (designState !== s || s.token !== token) return;
    paintError(e.message);
  }
}

function paintLoader(msg) {
  const flow = COPY[designState?.mode || "design"].flow;
  setHTML(app, `
    <div class="rev-top">${XBTN}</div>
    <div class="rev-body teach">
      <div class="t-label">${esc(flow)}</div>
      <div class="drill-loading"><span class="spinner"></span><span>${esc(msg)}</span></div>
    </div>`);
}

function paintError(message) {
  const flow = COPY[designState?.mode || "design"].flow;
  setHTML(app, `
    <div class="rev-top">${XBTN}</div>
    <div class="rev-body teach">
      <div class="t-label">${esc(flow)}</div>
      <div class="block tint">${esc(message)}</div>
      <button class="btn btn-ghost btn-block" data-action="return-focus">Back to the set</button>
    </div>`);
}

function counter(len) {
  const over = len > MAX_DESIGN_CHARS;
  return `<span class="${over ? "over" : ""}">${len.toLocaleString()} / ${MAX_DESIGN_CHARS.toLocaleString()}</span>${over ? " · too long, trim it before submitting" : ""}`;
}

function paintForm() {
  const s = designState;
  const len = assembleAnswer(s.sections, s.mode).length;
  setHTML(app, `
    <div class="rev-top">${XBTN}</div>
    <div class="rev-body teach">
      <div class="t-label">${esc(COPY[s.mode].brief)}</div>
      <p class="teach-lead">${esc(s.brief)}</p>
      ${s.mode === "clinical" && s.rubric.length ? `<p class="help">Investigations available: ${esc(s.rubric.join(", "))}</p>` : ""}
      <div class="t-label" style="margin-top:16px">${esc(COPY[s.mode].answer)}</div>
      <p class="help">${s.mode === "clinical" ? "Reason it through before you see any results." : "Every section is optional. Aim for 10–15 minutes."}</p>
      <div class="design-sections">
        ${(s.mode === "clinical" ? CLINICAL_SECTIONS : SECTIONS).map(({ key, title, hint }) => `
          <details class="design-section"${s.sections[key] ? " open" : ""}>
            <summary>${esc(title)}${s.sections[key] ? " ✓" : ""}</summary>
            <textarea class="sa-input" data-key="${key}" rows="3" aria-label="${esc(title)}" placeholder="${esc(hint)}">${esc(s.sections[key])}</textarea>
          </details>`).join("")}
      </div>
      <div class="design-count" id="designCount" aria-live="polite">${counter(len)}</div>
      <button class="btn btn-primary btn-block" data-action="design-submit">${esc(COPY[s.mode].submit)}</button>
    </div>`);
  app.querySelectorAll(".design-section textarea").forEach((ta) => {
    const box = /** @type {HTMLTextAreaElement} */ (ta);
    box.addEventListener("input", () => {
      s.sections[box.dataset.key] = box.value;
      const out = document.getElementById("designCount");
      if (out) setHTML(out, counter(assembleAnswer(s.sections, s.mode).length));
    });
  });
}

export async function submitDesign() {
  const s = designState;
  if (!s) return;
  const answer = assembleAnswer(s.sections, s.mode);
  if (!answer) return toast(COPY[s.mode].empty);
  if (answerTooLong(answer)) return toast(`Your design is over ${MAX_DESIGN_CHARS.toLocaleString()} characters. Trim it first.`);
  paintLoader(COPY[s.mode].grading);
  const token = (s.token = {});
  try {
    const res = await send({ type: "DESIGN_GRADE", mode: s.mode, state: s.encryptedState, task: s.brief, rubric: s.rubric, answer });
    if (designState !== s || s.token !== token) return;
    s.grading = res;
    paintFeedback();
  } catch (e) {
    if (designState !== s || s.token !== token) return;
    toast(e.message);
    paintForm();
  }
}

const COVERAGE = { covered: ["Covered", "ok"], partial: ["Partly", "warn"], missed: ["Missed", "no"] };
const VERDICT = { strong: ["Strong", "ok"], ok: ["OK", ""], weak: ["Weak", "warn"], missing: ["Missing", "no"] };

function rubricRows(grading) {
  return (grading.rubric_evaluation || []).map((r) => {
    const [label, cls] = COVERAGE[r.status] || COVERAGE.missed;
    return `<div class="idea-row"><div class="idea-top"><span class="name">${esc(r.point)}</span><span class="idea-chip ${cls}">${esc(label)}</span></div>${
      r.note ? `<div class="idea-note">${esc(r.note)}</div>` : ""}</div>`;
  }).join("");
}

function paintFeedback() {
  const s = designState;
  const last = s.curveballs[s.curveballs.length - 1];
  const g = last?.grading || s.grading;
  const sections = last ? [] : s.grading.sections || [];
  const canCurve = s.curveballs.length < MAX_CURVEBALLS;
  setHTML(app, `
    <div class="rev-top">${XBTN}</div>
    <div class="rev-body teach" aria-live="polite">
      <div class="t-label">${last ? `${esc(COPY[s.mode].turn)} ${s.curveballs.length} feedback` : "Feedback"}</div>
      ${last ? `<p class="teach-lead">${esc(last.question)}</p>` : ""}
      <div class="block" style="padding:6px 14px">${rubricRows(g)}</div>
      ${sections.length ? `<div class="t-label">By section</div>
        <div class="design-verdicts">${sections.map((x) => {
          const [label, cls] = VERDICT[x.verdict] || VERDICT.missing;
          return `<div class="idea-row"><div class="idea-top"><span class="name">${esc(x.section)}</span><span class="idea-chip ${cls}">${esc(label)}</span></div>${
            x.note ? `<div class="idea-note">${esc(x.note)}</div>` : ""}</div>`;
        }).join("")}</div>` : ""}
      <div class="block tint"><div class="t-label">Next time</div><div style="margin-top:6px">${esc(g.next_time)}</div></div>
      ${canCurve ? `<button class="btn btn-primary btn-block" data-action="design-curveball">${esc(COPY[s.mode].turnBtn)}</button>` : ""}
      <button class="btn ${canCurve ? "btn-ghost" : "btn-primary"} btn-block" data-action="design-finish">Finish</button>
    </div>`);
}

export async function requestDesignCurveball() {
  const s = designState;
  if (!s || s.curveballs.length >= MAX_CURVEBALLS) return;
  paintLoader("Throwing a curveball…");
  const token = (s.token = {});
  try {
    const res = await send({
      type: "DESIGN_CURVEBALL",
      mode: s.mode,
      state: s.encryptedState,
      task: s.brief,
      answer: assembleAnswer(s.sections, s.mode),
      previous: s.curveballs.map((c) => c.question),
    });
    if (designState !== s || s.token !== token) return;
    s.curveballs.push({ question: res.curveball, answer: "", grading: null });
    paintCurveballForm();
  } catch (e) {
    if (designState !== s || s.token !== token) return;
    toast(e.message);
    paintFeedback();
  }
}

function paintCurveballForm() {
  const s = designState;
  const cb = s.curveballs[s.curveballs.length - 1];
  setHTML(app, `
    <div class="rev-top">${XBTN}</div>
    <div class="rev-body teach">
      <div class="t-label">${esc(COPY[s.mode].turn)}${s.mode === "clinical" ? "" : ` ${s.curveballs.length} of ${MAX_CURVEBALLS}`}</div>
      <p class="teach-lead">${esc(cb.question)}</p>
      <textarea id="curveballInput" class="sa-input" rows="6" aria-label="${esc(COPY[s.mode].turnAsk)}" placeholder="${esc(COPY[s.mode].turnHint)}">${esc(cb.answer)}</textarea>
      <button class="btn btn-primary btn-block" data-action="design-submit-curveball">Submit</button>
    </div>`);
  document.getElementById("curveballInput")?.focus();
}

export async function submitDesignCurveball() {
  const s = designState;
  if (!s) return;
  const cb = s.curveballs[s.curveballs.length - 1];
  const answer = (/** @type {HTMLTextAreaElement|null} */ (document.getElementById("curveballInput"))?.value || "").trim();
  if (!answer) return toast("Write how your design changes first.");
  if (answerTooLong(answer)) return toast(`Keep it under ${MAX_DESIGN_CHARS.toLocaleString()} characters.`);
  cb.answer = answer;
  paintLoader("Reviewing your change…");
  const token = (s.token = {});
  try {
    // Graded with the brief, the original design and the curveball for context.
    const res = await send({
      type: "DESIGN_GRADE",
      mode: s.mode,
      state: s.encryptedState,
      task: s.brief,
      rubric: [],
      answer,
      curveball: cb.question,
      originalAnswer: assembleAnswer(s.sections, s.mode),
    });
    if (designState !== s || s.token !== token) return;
    cb.grading = res;
    paintFeedback();
  } catch (e) {
    if (designState !== s || s.token !== token) return;
    toast(e.message);
    paintCurveballForm();
  }
}

export async function finishDesignDrill() {
  const s = designState;
  if (!s || !s.grading) return;
  const score = drillScore(s.grading, s.curveballs.map((c) => c.grading));
  if (!s.logged) {
    s.logged = true;
    await Promise.all([
      bumpActivity(1),
      appendReviewLog(drillLogEntry({ kind: s.mode === "clinical" ? "clinical" : "design", sessionId: s.sessionId, fraction: score, id: uid() })),
    ]);
  }
  const pct = Math.round(score * 100);
  setHTML(app, `
    <div class="view teach-result">
      <div class="ahd"><div class="h-title">${esc(COPY[s.mode].done)}</div></div>
      <div class="block teach-score">
        <div class="score tnum ${pct >= 70 ? "ok" : "no"}">${pct}</div>
        <div><b>${esc(COPY[s.mode].score)}</b><div class="feedback">${esc(COPY[s.mode].scoreHint)}</div></div>
      </div>
      <div class="block"><div class="t-label">${esc(COPY[s.mode].brief)}</div><div style="margin-top:6px">${esc(s.brief)}</div></div>
      ${s.curveballs.filter((c) => c.grading).map((c, i) => `
        <div class="block"><div class="t-label">${esc(COPY[s.mode].turn)}${s.mode === "clinical" ? "" : ` ${i + 1}`}</div><div style="margin-top:6px">${esc(c.question)}</div></div>`).join("")}
      <div class="block tint"><div class="t-label">Keep in mind</div><div style="margin-top:6px">${esc((s.curveballs.at(-1)?.grading || s.grading).next_time)}</div></div>
      <button class="btn btn-primary btn-block" data-action="return-focus">Done</button>
    </div>`);
}
