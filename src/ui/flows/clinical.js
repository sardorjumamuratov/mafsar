import { app, bundle, esc, setFor, send, toast } from "../core.js";
import { goReturn, setFocusReturn } from "./review.js";
import { showChrome } from "../nav.js";
import { appendReviewLog, bumpActivity } from "../../storage/store.js";
import { drillLogEntry } from "../../storage/drill-log.js";
import { pickDrillChain } from "../../storage/chain-drill.js";
import { bindField, paintShell, primaryBtn, verdictRow, waitRow } from "./shell.js";

// Clinical case: read a vignette, reason to a diagnosis and the tests you would
// order (both fields always visible), then see the results and a verdict on each.
const TOTAL_CASES = 3;
const LIMIT = 2000;
const SHOW_COUNT_AT = 1600;

// { sessionId, setName, caseIdx, mode: "loading" | "answering" | "grading" | "results" | "error", task, inputs, grading, token }
let state = null;

export async function startClinicalCase(sessionId) {
  const { sessions, studySets } = await bundle();
  const set = setFor(sessionId, studySets);
  setFocusReturn("set:" + sessionId);
  showChrome(false);
  state = {
    sessionId,
    setName: String(sessions.find((s) => s.id === sessionId)?.title || set?.title || "").slice(0, 80),
    caseIdx: 1,
    mode: "loading",
    task: null,
    inputs: { diagnosis: "", tests: "" },
    grading: null,
    token: {},
  };
  app.dataset.drillFlow = "active";
  fetchTask();
}

export function clinicalCaseAction(action) {
  if (!state) return;
  if (action === "submit") submitAssessment();
  else if (action === "next") {
    if (state.caseIdx < TOTAL_CASES) {
      state.caseIdx++;
      state.mode = "loading";
      state.task = null;
      state.inputs = { diagnosis: "", tests: "" };
      state.grading = null;
      fetchTask();
    } else {
      state = null;
      goReturn();
    }
  } else if (action === "toggle-answers") {
    const el = document.getElementById("clinicalAnswers");
    const btn = document.getElementById("clinicalToggleBtn");
    if (el && btn) {
      el.hidden = !el.hidden;
      btn.textContent = el.hidden ? "See your answers" : "Hide your answers";
    }
  } else if (action === "toggle-full-case") {
    const el = document.getElementById("clinicalVignette");
    const btn = document.getElementById("clinicalToggleCaseBtn");
    if (el && btn) {
      const clamped = el.classList.toggle("st-clamp");
      btn.textContent = clamped ? "Show full case" : "Hide full case";
    }
  }
}

async function fetchTask() {
  renderClinical();
  const s = state;
  const token = (s.token = {});

  try {
    const { sessions, studySets, reviewLog } = await bundle();
    const set = setFor(s.sessionId, studySets);
    const session = sessions.find((x) => x.id === s.sessionId);

    // The case is built around one chain when the set has them, else the set topic.
    let concept = String(session?.title || set?.title || "Medicine").slice(0, 200);
    if (set?.chains?.length) {
      const chain = pickDrillChain(set.chains, reviewLog, s.sessionId) || set.chains[Math.floor(Math.random() * set.chains.length)];
      if (chain) concept = chain.title;
    }

    const cards = (set?.flashcards || []).filter((c) => c.front && c.back).slice(0, 50);
    const reference = cards.map((c) => ({ front: String(c.front).slice(0, 500), back: String(c.back).slice(0, 2000) }));

    const res = await send({ type: "DESIGN_TASK", concept, reference, mode: "clinical" });
    if (state !== s || s.token !== token) return;

    s.task = res;
    s.mode = "answering";
    renderClinical();
  } catch (e) {
    if (state !== s || s.token !== token) return;
    s.mode = "error";
    s.error = e.message;
    renderClinical();
  }
}

const SCORE = { strong: 1, ok: 0.8, weak: 0.4, missing: 0 };

async function submitAssessment() {
  const s = state;
  const d = s.inputs.diagnosis.trim();
  const t = s.inputs.tests.trim();
  if (!d || !t || s.mode !== "answering") return;

  const token = (s.token = {});
  s.mode = "grading";
  renderClinical();

  try {
    const answer = `Leading diagnosis and why:\n${d}\n\nTests you'd order and why:\n${t}`;
    const res = await send({
      type: "DESIGN_GRADE",
      mode: "clinical",
      state: s.task.state,
      task: s.task.brief,
      rubric: s.task.rubric,
      answer,
    });
    if (state !== s || s.token !== token) return;
    s.grading = res;
    s.mode = "results";

    const rows = res.sections || [];
    const fraction = rows.length ? rows.reduce((n, r) => n + (SCORE[r.verdict] ?? 0), 0) / rows.length : 0;
    bumpActivity(1).catch(() => {});
    appendReviewLog(drillLogEntry({
      kind: "clinical",
      sessionId: s.sessionId,
      fraction,
      id: `cc-${Date.now()}`,
    })).catch(() => {});

    renderClinical();
  } catch (e) {
    if (state !== s || s.token !== token) return;
    s.mode = "answering";
    renderClinical();
    toast(e.message);
  }
}

/** Server verdicts → the screen's three: correct, partly right, not quite. */
function verdictKind(v) {
  return v === "strong" || v === "ok" ? "ok" : v === "weak" ? "part" : "no";
}
const VERDICT_WORD = { ok: "correct", part: "partly right", no: "not quite" };
// "Tests requested" reads as "Tests: …" next to "Diagnosis: …".
const sectionName = (n) => (/^tests?\b/i.test(n) ? "Tests" : String(n || "Section"));

function counterHtml(id, len) {
  return `<span class="st-count-hint" id="${id}"${len > SHOW_COUNT_AT ? "" : " hidden"}>${len.toLocaleString()} / ${LIMIT.toLocaleString()}</span>`;
}

function field(id, labelText, placeholder, value, countId) {
  return `<label class="st-fieldlabel">
      <span class="st-labelrow"><span class="st-label">${esc(labelText)}</span>${counterHtml(countId, value.length)}</span>
      <textarea id="${id}" class="st-field h96" maxlength="${LIMIT}" placeholder="${esc(placeholder)}">${esc(value)}</textarea>
    </label>`;
}

function renderClinical() {
  const s = state;
  const mode = `Clinical case${s.setName ? ` · ${s.setName}` : ""}`;
  const counter = `${s.caseIdx} / ${TOTAL_CASES}`;
  const progress = ((s.caseIdx - (s.mode === "results" ? 0 : 1)) / TOTAL_CASES) * 100;

  if (s.mode === "loading" || s.mode === "grading") {
    return paintShell({ mode, progress, counter, body: waitRow(s.mode === "loading" ? "Writing a case…" : "Reviewing your assessment…") });
  }
  if (s.mode === "error") {
    return paintShell({
      mode, progress, counter,
      prompt: s.error || "Couldn't write a case.",
      promptClass: "ask",
      dock: primaryBtn("return-focus", "Back to the set"),
    });
  }

  if (s.mode === "answering") {
    paintShell({
      mode, progress, counter,
      hasProgress: s.caseIdx > 1,
      prompt: s.task.brief,
      promptClass: "text",
      body: `
        <div class="st-label st-mt20">Available tests</div>
        <div class="st-chips st-mt8">${(s.task.rubric || []).map((t) => `<span class="st-chip">${esc(t)}</span>`).join("")}</div>
        <div class="st-rule" style="margin:24px 0 20px"></div>
        <div style="display:flex;flex-direction:column;gap:18px">
          ${field("diagInput", "Leading diagnosis and why", "Reason it through before you see results", s.inputs.diagnosis, "diagCount")}
          ${field("testsInput", "Tests you'd order and why", "Which tests, and what you expect", s.inputs.tests, "testsCount")}
        </div>`,
      dock: primaryBtn("clinical-submit", "Submit assessment", 'id="clinSubmit" disabled'),
    });
    const btn = /** @type {HTMLButtonElement} */ (document.getElementById("clinSubmit"));
    const diag = /** @type {HTMLTextAreaElement} */ (document.getElementById("diagInput"));
    const tests = /** @type {HTMLTextAreaElement} */ (document.getElementById("testsInput"));
    const sync = () => {
      s.inputs.diagnosis = diag.value;
      s.inputs.tests = tests.value;
      btn.disabled = !(diag.value.trim() && tests.value.trim());
      for (const [el, id] of /** @type {[HTMLTextAreaElement, string][]} */ ([[diag, "diagCount"], [tests, "testsCount"]])) {
        const hint = document.getElementById(id);
        if (!hint) continue;
        hint.hidden = el.value.length <= SHOW_COUNT_AT;
        hint.textContent = `${el.value.length.toLocaleString()} / ${LIMIT.toLocaleString()}`;
      }
    };
    bindField(diag, { onChange: sync, onSubmit: () => !btn.disabled && submitAssessment() });
    bindField(tests, { onChange: sync, onSubmit: () => !btn.disabled && submitAssessment() });
    sync();
    return;
  }

  // results
  const g = s.grading;
  const results = (g.results || []).map((t) => `<div class="st-li"><div class="nm">${esc(t.name)}</div><div class="rs">${esc(t.result)}</div></div>`).join("");
  const verdicts = (g.sections || []).map((sec) => {
    const kind = verdictKind(sec.verdict);
    return `<div>${verdictRow(kind, `${sectionName(sec.section)}: ${VERDICT_WORD[kind]}`)}${sec.note ? `<div class="st-feedback">${esc(sec.note)}</div>` : ""}</div>`;
  }).join("");
  const last = s.caseIdx >= TOTAL_CASES;
  paintShell({
    mode, progress, counter,
    hasProgress: true,
    promptHtml: `<div class="st-prompt text st-clamp" id="clinicalVignette">${esc(s.task.brief)}</div>`,
    body: `
      <button type="button" class="st-link st-mt6" id="clinicalToggleCaseBtn" data-action="clinical-toggle-full-case">Show full case</button>
      ${results ? `<div class="st-label st-mt24">Results</div><div class="st-list">${results}</div>` : ""}
      <div class="st-label st-mt20">Your assessment</div>
      <div class="st-verdicts">${verdicts}</div>
      <button type="button" class="st-link st-mt16" id="clinicalToggleBtn" data-action="clinical-toggle-answers">See your answers</button>
      <div id="clinicalAnswers" hidden>
        <div class="st-label st-mt16">Leading diagnosis and why</div>
        <div class="st-text15 st-mt4">${esc(s.inputs.diagnosis)}</div>
        <div class="st-label st-mt16">Tests you'd order and why</div>
        <div class="st-text15 st-mt4">${esc(s.inputs.tests)}</div>
      </div>`,
    dock: primaryBtn("clinical-next", last ? "Finish" : "Next case"),
  });
}
