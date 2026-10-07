import { app, bundle, esc, send, setFor, toast } from "../core.js";
import { goReturn, setFocusReturn } from "./review.js";
import { showChrome } from "../nav.js";
import { annotateReviewLog, appendReviewLog, bumpActivity, uid } from "../../storage/store.js";
import { drillLogEntry } from "../../storage/drill-log.js";
import { SECTIONS, MAX_DESIGN_CHARS, rubricScore } from "../../storage/design.js";
import { styleFlags } from "../../storage/practice-style.js";
import {
  bindField, constraintAnchor, elapsed, feedbackSummary, focusEnd, icon, metaEnter, offerReviewCards, openTextSheet,
  paintShell, primaryBtn, reviewCardsAction, secondaryBtn, setReviewCards, verdictRow, waitRow,
} from "./shell.js";

// Design brief (docs/prompts/38 §7). Both styles share one brief, its sealed
// rubric and the same grading:
// - Learn concepts: four short steps (requirements, scale, architecture, risks),
//   optional concept prompts, hints that cost nothing, and "Check my thinking"
//   coaching per step, then an outline to review before submitting.
// - Interview simulation: the six sections, freeform, an elapsed timer, and no
//   feedback until it's submitted.
// Every draft lives in state, so moving between steps, the outline and the brief
// never loses text.
const LIMIT = 2000;
const SHOW_COUNT_AT = 1600;

const GUIDED = [
  {
    key: "requirements", title: "Requirements",
    question: "What must the system do for users?",
    hint: "Start with the main action, then add one important constraint.",
    hint2: "Name who uses it and the one action they do most, then one limit that action must respect.",
    placeholder: "e.g. Users create short links and get redirected in under 50 ms",
    chips: {
      Create: "What does a user create, and what do they get back?",
      Read: "What do users read most, and how fresh must it be?",
      Update: "What can change after it's created, and who may change it?",
      Delete: "Can things be deleted or expire, and what happens to anything pointing at them?",
      Authentication: "Who has to sign in, and for which actions?",
      "Rate limiting": "What would you limit, per user or per IP, to stop abuse?",
    },
  },
  {
    key: "estimates", title: "Scale",
    question: "What number should shape your design first?",
    hint: "Think about requests, users, storage, or read/write ratio.",
    hint2: "Turn the brief's traffic into requests per second, then say whether reads or writes dominate.",
    placeholder: "e.g. 5k writes/s and 500k reads/s, so reads dominate",
    chips: {
      QPS: "How many requests a second at the busiest time?",
      "Daily active users": "How many people use it each day, and how often?",
      "Read/write ratio": "Which happens more, reads or writes, and by how much?",
      "Storage growth": "How big is one record, and how many a year?",
      "Peak traffic": "How much higher than average is the busiest hour?",
    },
  },
  {
    key: "components", title: "Architecture",
    question: "Which components would handle the request?",
    hint: "Describe the request path from user to data.",
    hint2: "Follow one request: what it reaches first, where it's handled, where the data lives. API and data-model ideas fit here too.",
    placeholder: "e.g. Load balancer, API servers, Redis cache, Postgres keyed by short code",
    chips: {
      "Load balancer": "What spreads requests across your servers?",
      Cache: "What would you cache, and when does it go stale?",
      Queue: "What work could happen later instead of during the request?",
      Database: "Which store fits the data, and how is it keyed?",
      "Object storage": "Is there large data, like files or images, to keep apart?",
      Worker: "What background jobs does the system need?",
    },
  },
  {
    key: "tradeoffs", title: "Risks and trade-offs",
    question: "What could break first, and what would you trade off to prevent it?",
    hint: "Name one failure risk and one cost or complexity trade-off.",
    hint2: "Pick the component under the most load, say how it fails, then what your fix costs.",
    placeholder: "e.g. One Postgres primary takes every write; sharding fixes it but adds routing",
    chips: {
      "Hot key": "Could one key or user get far more traffic than the rest?",
      "Single point of failure": "Which one component, if it stops, stops everything?",
      Consistency: "Where would you accept stale data, and where not?",
      Latency: "Which step on the request path is slowest?",
      Cost: "What would get expensive at this scale?",
      "Operational complexity": "What makes this harder to run or debug?",
    },
  },
];

// The six simulation sections come from storage/design.js. The server names the
// last one "tradeoffs"; the chip row uses short names.
const SERVER_KEY = { requirements: "requirements", estimates: "estimates", api: "api", dataModel: "dataModel", components: "components", bottlenecks: "tradeoffs" };
const CHIP = { requirements: "Requirements", estimates: "Estimates", api: "API", dataModel: "Data model", components: "Components", bottlenecks: "Trade-offs" };
const EXAMPLE = {
  requirements: "e.g. 100M users, p99 under 200 ms, eventual consistency is fine for reads",
  estimates: "e.g. 5k writes/s, 100x reads, roughly 2 TB a year",
  api: "e.g. POST /links {url} returns {code}; GET /{code} redirects",
  dataModel: "e.g. links(code PK, url, created_at, owner_id)",
  components: "e.g. client, load balancer, API servers, cache, database",
  bottlenecks: "e.g. one primary takes every write; shard by code and accept eventual reads",
};
const STATUS = { strong: ["ok", "Covered"], ok: ["ok", "Covered"], weak: ["part", "Partly covered"], missing: ["no", "Not addressed yet"] };
const POINT = { covered: ["ok", "Covered"], partial: ["part", "Partly covered"], missed: ["no", "Not addressed yet"] };

export let designState = null;
export function setDesignState(v) {
  if (designState?.timer) clearInterval(designState.timer);
  designState = v;
}

export async function startDesignDrill(sessionId, style = "simulation") {
  const { sessions, studySets } = await bundle();
  const set = setFor(sessionId, studySets);
  const cards = (set?.flashcards || []).filter((c) => c.front && c.back && !c.deleted).slice(0, 50);
  if (!cards.length) return toast("This set has no cards to drill with yet.");
  setDesignState({
    sessionId,
    style,
    flags: styleFlags(style),
    topic: String(sessions.find((x) => x.id === sessionId)?.title || set?.title || "this topic").slice(0, 200),
    cards: cards.map((c) => ({ front: c.front, back: c.back })),
    brief: "", rubric: [], constraints: [], sealed: "",
    drafts: {},
    idx: 0,
    view: "step",
    hintLevel: {}, chip: null, checkpoints: {}, checking: false, checkpointsOff: false,
    startedAt: Date.now(), timer: null, grading: null, token: null, logId: null, hintsUsed: 0,
  });
  setFocusReturn("set:" + sessionId);
  showChrome(false);
  paintShell({ mode: "Design brief", progress: 0, counter: "", body: waitRow("Building a design exercise from your cards…") });
  requestDesignTask();
}

async function requestDesignTask() {
  const s = designState;
  const token = (s.token = {});
  try {
    const res = await send({ type: "DESIGN_TASK", mode: "design", concept: s.topic, reference: s.cards, practiceStyle: s.style });
    if (designState !== s || s.token !== token) return;
    s.brief = res.brief;
    s.rubric = res.rubric || []; // only for a server older than this client; never shown
    s.constraints = (res.constraints || []).slice(0, 4);
    s.sealed = res.state || "";
    paintDesignForm();
  } catch (e) {
    if (designState !== s || s.token !== token) return;
    toast(e.message);
    goReturn();
  }
}

const sectionsFor = (s) => (s.flags.stepByStep ? GUIDED : SECTIONS);
const filledCount = (s) => sectionsFor(s).filter((x) => (s.drafts[x.key] || "").trim()).length;
const modeLabel = (s) => `Design brief · ${s.flags.stepByStep ? "Learn concepts" : "Interview simulation"}`;
const briefHtml = (s) => `<div class="st-prompt text st-clamp l4" id="briefText">${esc(s.brief)}</div>`;
const briefToggle = `<button type="button" class="st-link st-mt6" id="briefBtn" data-action="design-toggle-brief">Show full brief</button>`;

export function paintDesignForm() {
  const s = designState;
  if (!s) return;
  if (!s.flags.stepByStep) return paintSimulation();
  if (s.view === "outline") return paintOutline();
  paintGuidedStep();
}

// --- Learn concepts --------------------------------------------------------------

function paintGuidedStep() {
  const s = designState;
  const step = GUIDED[s.idx];
  const text = s.drafts[step.key] || "";
  const cp = s.checkpoints[step.key];
  const level = s.hintLevel[step.key] || 0;
  const chips = s.flags.conceptChips
    ? `<div class="st-chips st-mt12" role="group" aria-label="Concepts to consider">${Object.keys(step.chips).map((c) =>
        `<button type="button" class="st-chip btn${s.chip === c ? " on" : ""}" data-action="design-chip" data-chip="${esc(c)}" aria-pressed="${s.chip === c}">${esc(c)}</button>`).join("")}</div>
      ${s.chip && step.chips[s.chip] ? `<div class="st-note">${esc(step.chips[s.chip])}</div>` : ""}`
    : "";
  const hints = [
    level >= 1 ? step.hint2 : "",
    level >= 2 ? (s.constraints.length ? `This brief says: ${s.constraints.join(" · ")}. Start from those numbers.` : "Re-read the brief's numbers: they usually point at what matters most.") : "",
  ].filter(Boolean).map((h) => `<div class="st-feedback st-mt8">${esc(h)}</div>`).join("");
  const coaching = cp && !cp.error
    ? `<div class="st-coach st-mt16" role="status">
        ${cp.covered?.length ? `<div class="st-label">You covered:</div><div class="st-text15 st-mt4">${esc(cp.covered[0])}</div>` : ""}
        ${cp.considerAdding?.length ? `<div class="st-label st-mt12">Consider adding:</div><div class="st-text15 st-mt4">${esc(cp.considerAdding[0])}</div>` : ""}
      </div>`
    : "";

  paintShell({
    mode: modeLabel(s),
    promptHtml: briefHtml(s),
    progress: (filledCount(s) / GUIDED.length) * 100,
    counter: `${s.idx + 1} / ${GUIDED.length}`,
    hasProgress: filledCount(s) > 0,
    body: `
      ${briefToggle}
      <div class="st-label st-mt24">Step ${s.idx + 1} of ${GUIDED.length} · ${esc(step.title)}</div>
      <div class="st-q">${esc(step.question)}</div>
      <div class="st-hint">${esc(step.hint)}</div>
      ${chips}
      ${hints}
      ${s.constraints.length ? `<div class="st-anchorwrap"${text.trim() ? "" : " hidden"} id="anchorWrap">${constraintAnchor(s.constraints, "design-brief")}</div>` : ""}
      <textarea id="designAnswer" class="st-field h96 st-mt12" maxlength="${LIMIT}" placeholder="${esc(step.placeholder)}" aria-label="${esc(step.question)}">${esc(text)}</textarea>
      ${coaching}
      ${s.checkpointsOff ? `<div class="st-note">Checking a step isn't available right now. You can continue.</div>` : ""}
      <button type="button" class="st-link quiet st-mt16" data-action="design-finish-early">Finish early</button>`,
    dock: `
      ${secondaryBtn("design-unsure", level >= 2 ? "No more hints" : "I'm not sure", `id="dUnsure"${level >= 2 ? " disabled" : ""}`)}
      ${secondaryBtn("design-improve", "Improve this", 'id="dImprove" hidden')}
      ${primaryBtn("design-check", "Check my thinking", 'id="dCheck" hidden')}
      ${primaryBtn("design-next", s.idx === GUIDED.length - 1 ? "Review outline" : "Continue", 'id="dNext" hidden')}`,
    keys: (e) => {
      if (!metaEnter(e)) return;
      e.preventDefault();
      const check = /** @type {HTMLButtonElement|null} */ (document.getElementById("dCheck"));
      if (check && !check.hidden && !check.disabled) designCheck();
      else designNext();
    },
  });
  const box = /** @type {HTMLTextAreaElement} */ (document.getElementById("designAnswer"));
  bindField(box, {
    onChange: (v) => {
      s.drafts[step.key] = v;
      // New text after coaching means the coaching is about an older draft.
      if (cp && !cp.stale) cp.stale = true;
      syncGuidedDock();
      const wrap = document.getElementById("anchorWrap");
      if (wrap) wrap.hidden = false;
      const n = filledCount(s);
      const fill = /** @type {HTMLElement|null} */ (app.querySelector(".st-fill"));
      if (fill) fill.style.width = `${(n / GUIDED.length) * 100}%`;
    },
  });
  box.addEventListener("focus", () => { const w = document.getElementById("anchorWrap"); if (w) w.hidden = false; });
  syncGuidedDock();
  if (!cp || cp.stale) focusEnd(box);
}

/** Which dock buttons show: Check while there is new text to check, Continue otherwise; Improve after coaching. */
function syncGuidedDock() {
  const s = designState;
  const step = GUIDED[s.idx];
  const text = (s.drafts[step.key] || "").trim();
  const cp = s.checkpoints[step.key];
  const coached = cp && !cp.stale && !cp.error;
  const canCheck = s.flags.checkpoints && !s.checkpointsOff && !!text && !coached;
  const show = (id, on) => { const el = document.getElementById(id); if (el) el.hidden = !on; };
  show("dCheck", canCheck);
  show("dNext", !canCheck);
  show("dImprove", !!coached);
  show("dUnsure", !coached);
}

async function designCheck() {
  const s = designState;
  if (!s || s.checking) return;
  const step = GUIDED[s.idx];
  const answer = (s.drafts[step.key] || "").trim();
  if (!answer) return;
  const btn = /** @type {HTMLButtonElement|null} */ (document.getElementById("dCheck"));
  s.checking = true;
  if (btn) { btn.disabled = true; btn.textContent = "Checking…"; }
  try {
    const res = await send({ type: "DESIGN_CHECKPOINT", section: step.key, answer, task: s.brief, state: s.sealed, practiceStyle: s.style });
    if (designState !== s) return;
    s.checkpoints[step.key] = { covered: res.covered || [], considerAdding: res.considerAdding || [] };
  } catch (e) {
    if (designState !== s) return;
    if (e.code === "feature_disabled") s.checkpointsOff = true;
    else toast(e.message || "Couldn't check this step. You can continue.");
  } finally {
    if (designState === s) s.checking = false;
  }
  if (designState === s && s.view === "step" && GUIDED[s.idx] === step) paintGuidedStep();
}

function designNext() {
  const s = designState;
  if (!s) return;
  if (!s.flags.stepByStep) {
    const next = SECTIONS[SECTIONS.findIndex((x) => x.key === s.activeKey) + 1];
    if (next) { s.activeKey = next.key; paintSimulation(); }
    return;
  }
  s.chip = null;
  if (s.idx < GUIDED.length - 1) {
    s.idx++;
    paintGuidedStep();
  } else {
    s.view = "outline";
    paintOutline();
  }
}

function paintOutline() {
  const s = designState;
  const anyEmpty = GUIDED.some((g) => !(s.drafts[g.key] || "").trim());
  paintShell({
    mode: modeLabel(s),
    prompt: "Your design outline",
    promptClass: "ask",
    progress: (filledCount(s) / GUIDED.length) * 100,
    counter: `${filledCount(s)} / ${GUIDED.length}`,
    hasProgress: true,
    body: `
      <div class="st-list st-mt16">${GUIDED.map((g, i) => {
        const v = (s.drafts[g.key] || "").trim();
        return `<div class="st-li roomy">
            <div class="st-labelrow"><span class="nm">${esc(g.title)}</span><button type="button" class="st-link" data-action="design-edit" data-step="${i}" aria-label="Edit ${esc(g.title)}">Edit</button></div>
            ${v ? `<div class="rs" style="white-space:pre-wrap">${esc(v)}</div>` : `<div class="rs st-muted">Not answered yet</div>`}
          </div>`;
      }).join("")}</div>
      ${anyEmpty ? `<div class="st-note">Unanswered areas will be marked as skipped.</div>` : ""}`,
    dock: `${anyEmpty ? secondaryBtn("design-finish-early", "Finish early") : ""}${primaryBtn("design-submit", "Submit design")}`,
    keys: (e) => { if (metaEnter(e)) { e.preventDefault(); submitDesign(); } },
  });
}

// --- Interview simulation ---------------------------------------------------------

function paintSimulation() {
  const s = designState;
  if (!s.activeKey) s.activeKey = SECTIONS[0].key;
  const idx = SECTIONS.findIndex((x) => x.key === s.activeKey);
  const sec = SECTIONS[idx];
  const next = SECTIONS[idx + 1];
  const text = s.drafts[sec.key] || "";
  const filled = filledCount(s);
  const tabs = SECTIONS.map((x) => {
    const cur = x.key === s.activeKey;
    const has = (s.drafts[x.key] || "").trim().length > 0;
    return `<button type="button" class="st-tab${cur ? " cur" : has ? " done" : ""}" data-action="design-nav" data-key="${x.key}" data-chip="${x.key}"${cur ? ' aria-current="true"' : ""}>${!cur && has ? icon("check", 12, 3) : ""}${esc(CHIP[x.key])}</button>`;
  }).join("");

  paintShell({
    mode: modeLabel(s),
    promptHtml: briefHtml(s),
    progress: (filled / SECTIONS.length) * 100,
    counter: `${filled} / ${SECTIONS.length}`,
    hasProgress: filled > 0,
    body: `
      ${briefToggle}
      <div class="st-summaryline st-mt16" id="simSummary"><span>${filled} of ${SECTIONS.length} sections written</span><span aria-label="Time elapsed" id="stElapsed">${elapsed(s.startedAt)}</span></div>
      <div class="st-tabs" id="designChips" role="tablist" aria-label="Design sections" style="margin-top:10px">${tabs}</div>
      <div class="st-labelrow st-mt24">
        <div class="st-q" style="margin-top:0">${esc(sec.title)}</div>
        <span class="st-count-hint" id="designCount"${text.length > SHOW_COUNT_AT ? "" : " hidden"}>${text.length.toLocaleString()} / ${LIMIT.toLocaleString()}</span>
      </div>
      <div class="st-hint">${esc(sec.hint)}</div>
      ${s.constraints.length ? `<div class="st-anchorwrap"${text.trim() ? "" : " hidden"} id="anchorWrap">${constraintAnchor(s.constraints, "design-brief")}</div>` : ""}
      <textarea id="designAnswer" class="st-field h180 st-mt12" maxlength="${LIMIT}" placeholder="${esc(EXAMPLE[sec.key])}" aria-label="${esc(sec.title)}">${esc(text)}</textarea>`,
    dock: next
      ? `${secondaryBtn("design-finish-early", "Finish early")}${primaryBtn("design-nav", `Next: ${CHIP[next.key]}`, `data-key="${next.key}"`)}`
      : primaryBtn("design-submit", "Submit design"),
    keys: (e) => {
      if (!metaEnter(e)) return;
      e.preventDefault();
      if (next) designNext();
      else submitDesign();
    },
  });

  const box = /** @type {HTMLTextAreaElement} */ (document.getElementById("designAnswer"));
  bindField(box, {
    onChange: (v) => {
      s.drafts[sec.key] = v;
      const hint = document.getElementById("designCount");
      if (hint) {
        hint.hidden = v.length <= SHOW_COUNT_AT;
        hint.textContent = `${v.length.toLocaleString()} / ${LIMIT.toLocaleString()}`;
      }
      const wrap = document.getElementById("anchorWrap");
      if (wrap) wrap.hidden = false;
      const n = filledCount(s);
      const count = app.querySelector(".st-count");
      const fill = /** @type {HTMLElement|null} */ (app.querySelector(".st-fill"));
      const summary = document.querySelector("#simSummary span");
      if (count) count.textContent = `${n} / ${SECTIONS.length}`;
      if (fill) fill.style.width = `${(n / SECTIONS.length) * 100}%`;
      if (summary) summary.textContent = `${n} of ${SECTIONS.length} sections written`;
    },
  });
  box.addEventListener("focus", () => { const w = document.getElementById("anchorWrap"); if (w) w.hidden = false; });
  focusEnd(box);

  // Bring the active chip into view with scrollLeft (scrollIntoView would also scroll the page).
  const row = document.getElementById("designChips");
  const chip = row?.querySelector(`[data-chip="${s.activeKey}"]`);
  if (row && chip) {
    const r = row.getBoundingClientRect();
    const c = chip.getBoundingClientRect();
    if (c.left < r.left || c.right > r.right) row.scrollLeft += c.left - r.left - (r.width - c.width) / 2;
  }

  // The elapsed timer: a clock reading, so repaints never reset it. It stops itself once the drill ends.
  if (!s.timer) {
    s.timer = setInterval(() => {
      if (designState !== s || s.grading) { clearInterval(s.timer); s.timer = null; return; }
      const el = document.getElementById("stElapsed");
      if (el) el.textContent = elapsed(s.startedAt);
    }, 1000);
  }
}

// --- Actions (from the router) -----------------------------------------------------

export function designAction(action, payload) {
  const s = designState;
  if (!s) return;
  if (action === "nav") {
    if (!SECTIONS.some((x) => x.key === payload)) return;
    s.activeKey = payload;
    paintSimulation();
  } else if (action === "next") designNext();
  else if (action === "check") designCheck();
  else if (action === "unsure") {
    const step = GUIDED[s.idx];
    if (!step) return;
    s.hintLevel[step.key] = Math.min(2, (s.hintLevel[step.key] || 0) + 1);
    s.hintsUsed++;
    paintGuidedStep();
  } else if (action === "improve") {
    const cp = s.checkpoints[GUIDED[s.idx]?.key];
    if (cp) cp.stale = true;
    syncGuidedDock();
    focusEnd(/** @type {HTMLTextAreaElement|null} */ (document.getElementById("designAnswer")));
  } else if (action === "chip") {
    s.chip = s.chip === payload ? null : payload;
    paintGuidedStep();
  } else if (action === "edit") {
    const i = Number(payload);
    if (!(i >= 0 && i < GUIDED.length)) return;
    s.view = "step";
    s.idx = i;
    paintGuidedStep();
  } else if (action === "brief") {
    openTextSheet("The brief", s.brief);
  } else if (action === "toggle-brief") {
    const el = document.getElementById("briefText");
    const btn = document.getElementById("briefBtn");
    if (!el || !btn) return;
    const clamped = el.classList.toggle("st-clamp");
    btn.textContent = clamped ? "Show full brief" : "Hide full brief";
  } else if (action === "toggle-compare") {
    const el = document.getElementById("designModel");
    const btn = document.getElementById("designModelBtn");
    if (!el || !btn) return;
    el.hidden = !el.hidden;
    btn.textContent = el.hidden ? "Compare your approach" : "Hide the comparison";
  }
}

/** The sections as the server's keys; empty ones are left out (skipped). */
function answersFor(s) {
  const out = {};
  for (const x of sectionsFor(s)) {
    const v = (s.drafts[x.key] || "").trim();
    if (v) out[s.flags.stepByStep ? x.key : SERVER_KEY[x.key]] = v;
  }
  return out;
}

export async function submitDesign() {
  const s = designState;
  if (!s || s.grading || s.submitting) return;
  const answers = answersFor(s);
  const total = Object.values(answers).join("").length;
  if (!total) return toast("Write in at least one section first.");
  // Sections are capped at 2,000 characters each, but the grader takes 4,000 in all.
  if (total > MAX_DESIGN_CHARS) return toast(`Your design is over ${MAX_DESIGN_CHARS.toLocaleString()} characters in total. Trim a section.`);

  s.submitting = true;
  paintShell({ mode: modeLabel(s), progress: 100, counter: "", body: waitRow("Reviewing your design…") });
  const token = (s.token = {});
  try {
    const res = await send({
      type: "DESIGN_GRADE", mode: "design", task: s.brief, rubric: s.rubric, state: s.sealed, answers, practiceStyle: s.style,
    });
    if (designState !== s || s.token !== token) return;
    s.grading = res;
    s.logId = uid();
    const now = Date.now();
    await Promise.all([
      bumpActivity(1),
      appendReviewLog(drillLogEntry({
        kind: "design", sessionId: s.sessionId, fraction: rubricScore(res.rubric_evaluation), id: s.logId,
        meta: {
          practiceStyle: s.style, mode: "design_brief", startedAt: new Date(s.startedAt).toISOString(),
          completedAt: new Date(now).toISOString(), durationMs: now - s.startedAt, usedHint: s.hintsUsed > 0, hintCount: s.hintsUsed,
        },
      })),
    ]);
    paintDesignFeedback();
  } catch (e) {
    if (designState !== s || s.token !== token) return;
    s.submitting = false;
    toast(e.message);
    paintDesignForm(); // the drafts are still in state
  }
}

function paintDesignFeedback() {
  const s = designState;
  const g = s.grading;
  const guided = s.flags.stepByStep;
  const byKey = new Map((g.sections || []).map((x) => [x.key || x.section, x]));
  const rows = (guided ? GUIDED : SECTIONS).map((sec) => {
    const title = sec.title;
    if (!(s.drafts[sec.key] || "").trim()) return `<div class="st-li roomy">${verdictRow("skip", `${title} · Skipped`)}</div>`;
    const v = byKey.get(guided ? sec.key : SERVER_KEY[sec.key]) || byKey.get(title);
    if (!v) return `<div class="st-li roomy">${verdictRow("skip", `${title} · Not graded`)}</div>`;
    const [kind, label] = STATUS[v.verdict] || STATUS.missing;
    return `<div class="st-li roomy">${verdictRow(kind, `${title} · ${label}`)}${v.note ? `<div class="st-feedback">${esc(v.note)}</div>` : ""}</div>`;
  }).join("");

  const points = (g.rubric_evaluation || []);
  const earned = points.reduce((n, p) => n + (p.status === "covered" ? 1 : p.status === "partial" ? 0.5 : 0), 0);
  const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  const compare = points.map((p) => {
    const [kind, label] = POINT[p.status] || POINT.missed;
    return `<div class="st-li">${verdictRow(kind, `${p.point} · ${label}`)}${p.note ? `<div class="st-feedback">${esc(p.note)}</div>` : ""}</div>`;
  }).join("");

  paintShell({
    mode: modeLabel(s),
    promptHtml: briefHtml(s),
    progress: 100,
    counter: `${filledCount(s)} / ${(guided ? GUIDED : SECTIONS).length}`,
    hasProgress: true,
    body: `
      ${briefToggle}
      <div class="st-mt24">${feedbackSummary({
        strongest: g.strongestPart,
        gap: g.highestLeverageGap,
        scoreLine: points.length ? `Rubric coverage: ${fmt(earned)} of ${points.length} points` : "",
      })}</div>
      <div class="st-label st-mt24">${guided ? "Steps" : "Sections"}</div>
      <div class="st-list">${rows}</div>
      <button type="button" class="st-link st-mt12" id="designModelBtn" data-action="design-toggle-compare">Compare your approach</button>
      <div id="designModel" hidden>
        <div class="st-label st-mt16">A strong answer covers</div>
        <div class="st-list">${compare}</div>
        ${g.next_time ? `<div class="st-label st-mt16">Next time</div><div class="st-text15 st-mt4">${esc(g.next_time)}</div>` : ""}
      </div>
      ${reviewCardsAction()}`,
    dock: primaryBtn("return-focus", "Done"),
  });

  setReviewCards(() => {
    const gaps = points
      .filter((p) => p.status !== "covered")
      .map((p) => ({ type: p.status === "partial" ? "partial_rubric" : "missed_rubric", text: `${p.point}${p.note ? `: ${p.note}` : ""}`.slice(0, 400) }));
    const tradeoffs = (g.sections || []).find((x) => x.key === "tradeoffs");
    if (tradeoffs && (tradeoffs.verdict === "weak" || tradeoffs.verdict === "missing")) gaps.push({ type: "missing_tradeoff", text: (tradeoffs.note || "Trade-offs").slice(0, 400) });
    if (g.highestLeverageGap) gaps.unshift({ type: "missed_rubric", text: g.highestLeverageGap.slice(0, 400) });
    offerReviewCards({
      sessionId: s.sessionId, mode: "design", gaps, topic: s.topic, practiceStyle: s.style,
      onSaved: (ids) => { if (s.logId) annotateReviewLog(s.logId, { savedSuggestedCardIds: ids }).catch(() => {}); },
    });
  });
}
