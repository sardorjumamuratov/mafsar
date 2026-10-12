import { app, bundle, esc, send, setFor, toast } from "../core.js";
import { goReturn, setFocusReturn } from "./review.js";
import { showChrome } from "../nav.js";
import { annotateReviewLog, appendReviewLog, bumpActivity, uid } from "../../storage/store.js";
import { drillLogEntry } from "../../storage/drill-log.js";
import { styleFlags } from "../../storage/practice-style.js";
import { bindField, feedbackSummary, focusEnd, icon, metaEnter, offerReviewCards, paintShell, primaryBtn, reviewCardsAction, setReviewCards, verdictRow, waitRow } from "./shell.js";

// What breaks (docs/prompts/38 §9): a small architecture with one planted flaw.
// The learner can mark the component they suspect (a thinking aid; it never
// reveals anything), then says what fails, why, and what they'd change:
// - Learn concepts: three short fields, revealed one at a time; free hints.
// - Interview simulation: one free-text answer; one hint that costs half a point.
// The flaw stays sealed on the server until grading; hints come back in a new
// sealed state, which grading reads to know a hint was used.
export let bottleneckState = null;
export function setBottleneckState(v) { bottleneckState = v; }

const FIELDS = [
  { key: "flaw", label: "What breaks?", placeholder: "Name the component or behavior that fails." },
  { key: "reason", label: "Why does it fail?", placeholder: "Describe the load, failure condition, or chain reaction." },
  { key: "fix", label: "What would you change?", placeholder: "Propose a fix and name one trade-off." },
];
const MEANINGFUL = 12; // characters before the next guided field opens by itself
const CRITERIA = [
  ["foundFlaw", "Flaw", "found_flaw"],
  ["explainedFailure", "Why it fails", "explanation_correct"],
  ["proposedFix", "Fix and trade-off", "fix_works"],
];
const STATUS = { covered: ["ok", "Covered"], partial: ["part", "Partly covered"], missed: ["no", "Not addressed yet"] };

export async function startBottleneckDrill(sessionId, style = "simulation") {
  const { sessions, studySets } = await bundle();
  const set = setFor(sessionId, studySets);
  const cards = (set?.flashcards || []).filter((c) => c.front && c.back && !c.deleted).slice(0, 50);
  if (!cards.length) return toast("This set has no cards to drill with yet.");
  bottleneckState = {
    sessionId,
    style,
    flags: styleFlags(style),
    topic: String(sessions.find((x) => x.id === sessionId)?.title || set?.title || "this topic").slice(0, 200),
    cards: cards.map((c) => ({ front: c.front, back: c.back })),
    task: null,
    components: [],
    selected: null,
    draft: "", // simulation answer
    parts: { flaw: "", reason: "", fix: "" },
    revealed: 1,
    hints: [],
    hintsDone: false,
    usedHint: false,
    hinting: false,
    result: null,
    step: "generating",
    startedAt: Date.now(),
    token: null,
    logId: null,
  };
  setFocusReturn("set:" + sessionId);
  showChrome(false);
  paintLoader("Setting up an architecture to debug…");
  requestBottleneckTask();
}

function paintLoader(msg) {
  paintShell({ mode: "What breaks", progress: 0, counter: "0 / 1", body: waitRow(msg) });
}

/** "API servers (3x)" or "Cache: Redis" → the component and its quieter detail. */
export function splitComponent(text) {
  const t = String(text || "").trim();
  const dash = t.match(/^(.+?)(?:\s+[—–-]\s+|:\s+)(.+)$/);
  if (dash) return { name: dash[1], detail: dash[2] };
  const paren = t.match(/^(.+?)\s*\((.+)\)$/);
  if (paren) return { name: paren[1], detail: paren[2] };
  return { name: t, detail: "" };
}

/** For a server older than 0.3.6 (no failingComponentId): the component the flaw text names, else the best word overlap. */
export function failingIndex(components, flaw) {
  const text = String(flaw || "").toLowerCase();
  if (!text) return -1;
  let best = -1;
  let bestScore = 0;
  components.forEach((c, i) => {
    const n = c.name.toLowerCase();
    let score = text.includes(n) ? 100 : 0;
    for (const w of n.split(/[^a-z0-9]+/).filter((x) => x.length >= 4)) if (text.includes(w)) score++;
    if (score > bestScore) { best = i; bestScore = score; }
  });
  return best;
}

async function requestBottleneckTask() {
  const s = bottleneckState;
  const token = (s.token = {});
  try {
    const res = await send({ type: "BOTTLENECK_TASK", concept: s.topic, reference: s.cards, practiceStyle: s.style });
    if (bottleneckState !== s || s.token !== token) return;
    s.task = res;
    // Components with ids come from 0.3.6+ servers; older ones send strings only,
    // and then selection stays a local thinking aid that isn't sent.
    s.components = Array.isArray(res.components) && res.components.length
      ? res.components.map((c) => ({ id: String(c.id), name: String(c.name), detail: String(c.detail || ""), server: true }))
      : (res.architecture || []).map((a, i) => ({ id: `c${i}`, ...splitComponent(a), server: false }));
    s.step = "answering";
    paintBottleneckQuestion();
  } catch (e) {
    if (bottleneckState !== s || s.token !== token) return;
    toast(e.message);
    goReturn();
  }
}

/** The architecture rail. Rows are selectable while answering; after grading the flaw's row is amber. */
function rail(s, { interactive, failingId = null, alternateId = null }) {
  return `<div class="st-rail st-mt12" role="list" aria-label="Request flow, in order">${s.components.map((c, i) => {
    const last = i === s.components.length - 1;
    const selected = s.selected === c.id;
    const failing = failingId === c.id;
    const tag = failing ? "Where it breaks" : alternateId === c.id ? "Also a real concern" : selected ? (interactive ? "Possible bottleneck" : "Your pick") : "";
    const content = `<span class="st-railname">${esc(c.name)}${c.detail ? `<span class="detail"> · ${esc(c.detail)}</span>` : ""}</span>${tag ? `<span class="st-railtag">${esc(tag)}</span>` : ""}`;
    return `<div class="st-row${last ? " last" : ""}" role="listitem">
        <div class="st-rail-col"><div class="st-dot sm${failing ? " amber" : selected ? " sel" : ""}"></div>${last ? "" : '<div class="st-line"></div>'}</div>
        ${interactive
          ? `<button type="button" class="st-cell sm st-railbtn${selected ? " sel" : ""}" data-action="bottleneck-select" data-id="${esc(c.id)}" aria-pressed="${selected}">${content}</button>`
          : `<div class="st-cell sm st-railitem${selected ? " sel" : ""}${failing ? " fail" : ""}">${content}</div>`}
      </div>`;
  }).join("")}</div>`;
}

function hintRow(s) {
  const guided = s.flags.hintPenalty === 0;
  const max = s.flags.progressiveHints;
  const done = s.hintsDone || s.hints.length >= max;
  const btn = done
    ? `<button type="button" class="st-link" disabled>${icon("bulb", 16)}${guided ? "No more hints" : "Hint used"}</button>`
    : `<button type="button" class="st-link" data-action="bottleneck-hint" id="bnHint">${icon("bulb", 16)}${guided ? "Get a hint" : `Hint<span class="dim"> −½ pt</span>`}</button>`;
  return `<div class="st-qrow"><span class="st-label">What breaks, and why?</span>${btn}</div>
    ${s.hints.map((h) => `<div class="st-feedback" style="margin-top:8px">${esc(h)}</div>`).join("")}`;
}

function answerFields(s) {
  if (!s.flags.structuredBottleneck) {
    return `<textarea id="bottleneckAnswer" class="st-field h140 st-mt8" placeholder="What fails, under what load or failure, and how you'd fix it" aria-label="What breaks, and why">${esc(s.draft)}</textarea>`;
  }
  return FIELDS.map((f, i) => `
    <label class="st-fieldlabel st-mt16" id="bnField${i}"${i < s.revealed ? "" : " hidden"}>
      <span class="st-label">${esc(f.label)}</span>
      <textarea id="bn_${f.key}" class="st-field h96" maxlength="1500" placeholder="${esc(f.placeholder)}">${esc(s.parts[f.key])}</textarea>
    </label>`).join("") +
    `<button type="button" class="st-link quiet st-mt8" data-action="bottleneck-continue" id="bnContinue"${s.revealed >= FIELDS.length ? " hidden" : ""}>Continue</button>`;
}

const hasAnswer = (s) => (s.flags.structuredBottleneck ? Object.values(s.parts).some((v) => v.trim()) : !!s.draft.trim());

export function paintBottleneckQuestion() {
  const s = bottleneckState;
  if (!s) return;
  s.step = "answering";
  const selected = s.components.find((c) => c.id === s.selected);
  paintShell({
    mode: "What breaks",
    prompt: s.task.narrative,
    promptClass: "text",
    progress: 0,
    counter: "0 / 1",
    hasProgress: hasAnswer(s) || !!s.selected,
    body: `
      <div class="st-label st-mt20">Architecture</div>
      <div class="st-note" style="margin-top:4px">Tap the part you suspect. It won't tell you if you're right.</div>
      ${rail(s, { interactive: true })}
      <div id="bnMark" role="status" class="st-markline"${selected ? "" : " hidden"}>
        <span>Marked as a possible bottleneck.</span>
        <button type="button" class="st-link" data-action="bottleneck-clear">I think it is elsewhere</button>
      </div>
      ${hintRow(s)}
      ${answerFields(s)}`,
    dock: primaryBtn("bottleneck-submit", "Submit", 'id="bottleneckSubmit" disabled'),
    keys: (e) => { if (metaEnter(e)) { e.preventDefault(); submitBottleneck(); } },
  });
  wireFields(s);
}

function wireFields(s) {
  const submit = /** @type {HTMLButtonElement} */ (document.getElementById("bottleneckSubmit"));
  const sync = () => { submit.disabled = !hasAnswer(s); };
  if (!s.flags.structuredBottleneck) {
    const box = /** @type {HTMLTextAreaElement} */ (document.getElementById("bottleneckAnswer"));
    bindField(box, { onChange: (v) => { s.draft = v; sync(); }, onSubmit: () => submitBottleneck() });
    sync();
    if (!s.hints.length) focusEnd(box);
    return;
  }
  FIELDS.forEach((f, i) => {
    const box = /** @type {HTMLTextAreaElement} */ (document.getElementById(`bn_${f.key}`));
    bindField(box, {
      onChange: (v) => {
        s.parts[f.key] = v;
        if (v.trim().length >= MEANINGFUL && s.revealed === i + 1) reveal(s);
        sync();
      },
      onSubmit: () => submitBottleneck(),
    });
  });
  sync();
  if (!s.hints.length) focusEnd(/** @type {HTMLTextAreaElement} */ (document.getElementById(`bn_${FIELDS[Math.max(0, s.revealed - 1)].key}`)));
}

/** Open the next guided field in place, so nothing typed moves or is lost. */
function reveal(s) {
  if (s.revealed >= FIELDS.length) return;
  s.revealed++;
  const field = document.getElementById(`bnField${s.revealed - 1}`);
  if (field) field.hidden = false;
  const cont = document.getElementById("bnContinue");
  if (cont && s.revealed >= FIELDS.length) cont.hidden = true;
}

export function bottleneckAction(action, payload) {
  const s = bottleneckState;
  if (!s) return;
  if (action === "select" && s.step === "answering") {
    s.selected = s.selected === payload ? null : payload;
    keepDraftsAndRepaint(s);
  } else if (action === "clear" && s.step === "answering") {
    s.selected = null;
    keepDraftsAndRepaint(s);
  } else if (action === "continue" && s.step === "answering") {
    reveal(s);
    const next = document.getElementById(`bn_${FIELDS[s.revealed - 1].key}`);
    focusEnd(/** @type {HTMLTextAreaElement|null} */ (next));
  } else if (action === "toggle-scenario") {
    const el = document.getElementById("bnScenario");
    const btn = document.getElementById("bnScenarioBtn");
    if (!el || !btn) return;
    const clamped = el.classList.toggle("st-clamp");
    btn.textContent = clamped ? "Show full scenario" : "Hide full scenario";
  } else if (action === "toggle-model") {
    const el = document.getElementById("bnModel");
    const btn = document.getElementById("bnModelBtn");
    if (!el || !btn) return;
    el.hidden = !el.hidden;
    btn.textContent = el.hidden ? "Compare your diagnosis" : "Hide the comparison";
  }
}

/** Selection repaints the rail; the drafts are already in state, and the scroll position is kept. */
function keepDraftsAndRepaint(s) {
  const body = document.getElementById("stBody");
  const top = body?.scrollTop || 0;
  paintBottleneckQuestion();
  const again = document.getElementById("stBody");
  if (again) again.scrollTop = top;
  /** @type {HTMLElement|null} */ (document.querySelector(`[data-action="bottleneck-select"][data-id="${CSS.escape(s.selected || "")}"]`))?.focus({ preventScroll: true });
}

export async function requestBottleneckHint() {
  const s = bottleneckState;
  if (!s || s.step !== "answering" || s.hinting || s.hintsDone) return;
  if (!s.flags.structuredBottleneck) {
    s.draft = /** @type {HTMLTextAreaElement|null} */ (document.getElementById("bottleneckAnswer"))?.value || s.draft;
  }
  s.hinting = true;
  const btn = /** @type {HTMLButtonElement|null} */ (document.getElementById("bnHint"));
  if (btn) btn.disabled = true;
  const token = (s.token = {});
  try {
    const res = await send({ type: "BOTTLENECK_HINT", state: s.task.state, level: s.hints.length + 1 });
    if (bottleneckState !== s || s.token !== token) return;
    s.hints.push(res.hint);
    s.usedHint = true;
    // The new state records the hint, so grading knows about it.
    if (res.state) s.task.state = res.state;
  } catch (e) {
    if (bottleneckState !== s || s.token !== token) return;
    if (e.code === "HINT_LIMIT_REACHED") s.hintsDone = true;
    else toast(e.message);
  } finally {
    if (bottleneckState === s) s.hinting = false;
  }
  if (bottleneckState === s && s.step === "answering") keepDraftsAndRepaint(s);
}

export async function submitBottleneck() {
  const s = bottleneckState;
  if (!s || s.step !== "answering" || !hasAnswer(s)) return;
  const structured = s.flags.structuredBottleneck;
  const answer = structured
    ? FIELDS.map((f) => (s.parts[f.key].trim() ? `${f.label} ${s.parts[f.key].trim()}` : "")).filter(Boolean).join("\n")
    : s.draft.trim();
  const selected = s.components.find((c) => c.id === s.selected);
  s.step = "grading";
  paintLoader("Reviewing your diagnosis…");
  const token = (s.token = {});
  try {
    const res = await send({
      type: "BOTTLENECK_GRADE",
      state: s.task.state,
      // The labelled combined answer keeps a pre-0.3.6 server grading correctly.
      answer,
      ...(structured ? { parts: { flaw: s.parts.flaw.trim(), reason: s.parts.reason.trim(), fix: s.parts.fix.trim() } } : {}),
      ...(selected?.server ? { selectedComponentId: selected.id } : {}),
      usedHint: s.usedHint,
      practiceStyle: s.style,
    });
    if (bottleneckState !== s || s.token !== token) return;
    s.result = res;
    s.step = "checked";
    s.logId = uid();
    const now = Date.now();
    await Promise.all([
      bumpActivity(1),
      appendReviewLog(drillLogEntry({
        kind: "bottleneck", sessionId: s.sessionId, fraction: (Number(res.score) || 0) / 3, id: s.logId,
        meta: {
          practiceStyle: s.style, mode: "what_breaks", startedAt: new Date(s.startedAt).toISOString(), completedAt: new Date(now).toISOString(),
          durationMs: now - s.startedAt, usedHint: s.usedHint, hintCount: s.hints.length, selectedComponentId: selected?.id,
        },
      })),
    ]);
    paintBottleneckFeedback();
  } catch (e) {
    if (bottleneckState !== s || s.token !== token) return;
    toast(e.message);
    paintBottleneckQuestion(); // the drafts and the selection are still in state
  }
}

/** Criteria from a 0.3.6+ server, or rebuilt from the old booleans. */
function criteriaOf(r) {
  return Object.fromEntries(CRITERIA.map(([k, , legacy]) => {
    const c = r.criteria?.[k];
    return [k, c && STATUS[c.status] ? c : { status: r[legacy] ? "covered" : "missed", note: "" }];
  }));
}

function paintBottleneckFeedback() {
  const s = bottleneckState;
  const r = s.result;
  const criteria = criteriaOf(r);
  const points = CRITERIA.filter(([k]) => criteria[k].status === "covered").length;
  const anyCredit = CRITERIA.some(([k]) => criteria[k].status !== "missed");
  const verdict = r.verdict || (points === 3 ? "correct" : anyCredit ? "partly_right" : "not_quite");
  const [kind, label] = { correct: ["ok", "Correct"], partly_right: ["part", "Partly right"], not_quite: ["no", "Not quite"] }[verdict] || ["no", "Not quite"];
  const failingId = r.failingComponentId || s.components[failingIndex(s.components, r.planted_flaw)]?.id || null;
  const alternateId = r.alternateProblem?.componentId || null;
  const alternate = r.alternateProblem?.description || r.other_valid_issue || "";
  const penalty = Number(r.hintPenalty ?? (r.usedHint && s.flags.hintPenalty ? 0.5 : 0));
  const model = r.modelAnswer || { flaw: r.planted_flaw, whyItFails: r.why_it_fails, goodFix: r.model_solution, tradeoff: "" };

  paintShell({
    mode: "What breaks",
    progress: 100,
    counter: "1 / 1",
    hasProgress: true,
    promptHtml: `<div class="st-prompt text st-clamp" id="bnScenario">${esc(s.task.narrative)}</div>`,
    body: `
      <button type="button" class="st-link st-mt6" id="bnScenarioBtn" data-action="bottleneck-toggle-scenario">Show full scenario</button>
      <div class="st-mt24">${verdictRow(kind, label)}</div>
      <div class="st-mt12">${feedbackSummary({
        strongest: r.strongestPart,
        gap: r.highestLeverageGap,
        scoreLine: `Score: ${r.score} of 3${penalty ? " (half a point off for the hint)" : ""}`,
      })}</div>
      <div class="st-label st-mt24">Architecture</div>
      ${rail(s, { interactive: false, failingId, alternateId })}
      ${alternate ? `<div class="st-feedback st-mt12">You also spotted a real concern: ${esc(alternate)}</div>` : ""}
      <div class="st-label st-mt24">Your diagnosis</div>
      <div class="st-list">${CRITERIA.map(([k, title]) => {
        const [ck, cl] = STATUS[criteria[k].status] || STATUS.missed;
        return `<div class="st-li roomy">${verdictRow(ck, `${title} · ${cl}`)}${criteria[k].note ? `<div class="st-feedback">${esc(criteria[k].note)}</div>` : ""}</div>`;
      }).join("")}</div>
      ${r.feedback ? `<div class="st-feedback st-mt8">${esc(r.feedback)}</div>` : ""}
      <button type="button" class="st-link st-mt12" id="bnModelBtn" data-action="bottleneck-toggle-model">Compare your diagnosis</button>
      <div id="bnModel" hidden>
        <div class="st-label st-mt16">The flaw</div>
        <div class="st-text15 st-mt4">${esc(model.flaw)}</div>
        ${model.whyItFails ? `<div class="st-label st-mt16">Why it fails</div><div class="st-text15 st-mt4">${esc(model.whyItFails)}</div>` : ""}
        <div class="st-label st-mt16">A good fix</div>
        <div class="st-text15 st-mt4">${esc(model.goodFix)}</div>
        ${model.tradeoff ? `<div class="st-label st-mt16">Trade-off to consider</div><div class="st-text15 st-mt4">${esc(model.tradeoff)}</div>` : ""}
      </div>
      ${reviewCardsAction()}`,
    dock: primaryBtn("return-focus", "Finish"),
  });

  setReviewCards(() => {
    const gaps = [];
    if (criteria.foundFlaw.status !== "covered") gaps.push({ type: "missed_bottleneck", text: `${model.flaw}${criteria.foundFlaw.note ? ` (${criteria.foundFlaw.note})` : ""}`.slice(0, 400) });
    if (criteria.explainedFailure.status !== "covered") gaps.push({ type: "missed_bottleneck", text: `Why it fails: ${model.whyItFails || criteria.explainedFailure.note}`.slice(0, 400) });
    if (criteria.proposedFix.status !== "covered") gaps.push({ type: "missing_tradeoff", text: `${model.goodFix}${model.tradeoff ? ` Trade-off: ${model.tradeoff}` : ""}`.slice(0, 400) });
    if (r.highestLeverageGap) gaps.unshift({ type: "missed_bottleneck", text: r.highestLeverageGap.slice(0, 400) });
    offerReviewCards({
      sessionId: s.sessionId, mode: "bottleneck", gaps, topic: s.topic, practiceStyle: s.style,
      onSaved: (ids) => { if (s.logId) annotateReviewLog(s.logId, { savedSuggestedCardIds: ids }).catch(() => {}); },
    });
  });
}
