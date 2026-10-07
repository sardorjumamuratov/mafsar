import { app, bundle, esc, send, setFor, toast } from "../core.js";
import { goReturn, setFocusReturn } from "./review.js";
import { showChrome } from "../nav.js";
import { appendReviewLog, bumpActivity, uid } from "../../storage/store.js";
import { drillLogEntry } from "../../storage/drill-log.js";
import { SECTIONS, answerTooLong, assembleAnswer, emptySections, MAX_DESIGN_CHARS, rubricScore } from "../../storage/design.js";
import { bindField, feedbackSummary, focusEnd, icon, paintShell, primaryBtn, secondaryBtn, verdictRow, waitRow } from "./shell.js";

// Design brief: one section on screen at a time, a chip row to move between
// them, and a draft per section that autosaves into state. Every section is
// optional. Clinical cases have their own flow (clinical.js).
const LIMIT = 2000;
const SHOW_COUNT_AT = 1600;

// The chip row uses short names; the section titles stay the grader's names.
const CHIP = { requirements: "Requirements", estimates: "Estimates", api: "API", dataModel: "Data model", components: "Components", bottlenecks: "Trade-offs" };
const EXAMPLE = {
  requirements: "e.g. 100M users, p99 under 200 ms, eventual consistency is fine for reads",
  estimates: "e.g. 5k writes/s, 100x reads, roughly 2 TB a year",
  api: "e.g. POST /links {url} returns {code}; GET /{code} redirects",
  dataModel: "e.g. links(code PK, url, created_at, owner_id)",
  components: "e.g. client, load balancer, API servers, cache, database",
  bottlenecks: "e.g. one primary takes every write; shard by code and accept eventual reads",
};

export let designState = null; // { sessionId, topic, cards, brief, rubric, sections, grading, token, activeSectionKey }
export function setDesignState(v) { designState = v; }

export async function startDesignDrill(sessionId) {
  const { studySets } = await bundle();
  const set = setFor(sessionId, studySets);
  const cards = (set?.flashcards || []).filter((c) => c.front && c.back).slice(0, 50);
  if (!cards.length) return toast("This set has no cards to drill with yet.");

  designState = {
    sessionId,
    topic: String(set?.title || "this topic").slice(0, 200),
    cards: cards.map((c) => ({ front: c.front, back: c.back })),
    brief: "",
    rubric: [],
    sections: emptySections(),
    grading: null,
    token: null,
    activeSectionKey: SECTIONS[0].key,
  };
  setFocusReturn("set:" + sessionId);
  showChrome(false);
  paintLoader("Building a design exercise from your cards...", "0 / 6");
  requestDesignTask();
}

function paintLoader(msg, counter) {
  paintShell({ mode: "Design brief · ~15 min", progress: 0, counter, body: waitRow(msg) });
}

async function requestDesignTask() {
  const s = designState;
  const token = (s.token = {});
  try {
    const res = await send({ type: "DESIGN_TASK", mode: "design", concept: s.topic, reference: s.cards });
    if (designState !== s || s.token !== token) return;
    s.brief = res.brief;
    s.rubric = res.rubric || [];
    paintDesignForm();
  } catch (e) {
    if (designState !== s || s.token !== token) return;
    toast(e.message);
    goReturn();
  }
}

const filledCount = (s) => SECTIONS.filter((sec) => s.sections[sec.key].trim()).length;

/** The brief, clamped to four lines, with its toggle just below. The toggle works in place. */
const briefHtml = (s) => `<div class="st-prompt text st-clamp l4" id="briefText">${esc(s.brief)}</div>`;
const briefToggle = `<button type="button" class="st-link st-mt6" id="briefBtn" data-action="design-toggle-brief">Show full brief</button>`;

export function paintDesignForm() {
  const s = designState;
  if (!s) return;
  const idx = SECTIONS.findIndex((sec) => sec.key === s.activeSectionKey);
  const sec = SECTIONS[idx];
  const next = SECTIONS[idx + 1];
  const filled = filledCount(s);
  const len = s.sections[sec.key].length;

  const tabs = SECTIONS.map((x) => {
    const cur = x.key === s.activeSectionKey;
    const has = s.sections[x.key].trim().length > 0;
    return `<button type="button" class="st-tab${cur ? " cur" : has ? " done" : ""}" data-action="design-nav" data-key="${x.key}" data-chip="${x.key}"${cur ? ' aria-current="true"' : ""}>${!cur && has ? icon("check", 12, 3) : ""}${esc(CHIP[x.key])}</button>`;
  }).join("");

  paintShell({
    mode: "Design brief · ~15 min",
    promptHtml: briefHtml(s),
    progress: (filled / SECTIONS.length) * 100,
    counter: `${filled} / ${SECTIONS.length}`,
    hasProgress: filled > 0,
    body: `
      ${briefToggle}
      <div class="st-tabs" id="designChips" role="tablist" aria-label="Design sections">${tabs}</div>
      <div class="st-labelrow st-mt24">
        <div style="font-size:17px;font-weight:650">${esc(sec.title)}</div>
        <span class="st-count-hint" id="designCount"${len > SHOW_COUNT_AT ? "" : " hidden"}>${len.toLocaleString()} / ${LIMIT.toLocaleString()}</span>
      </div>
      <div class="st-sub" style="margin-top:4px;font-size:14px;color:var(--st-muted)">${esc(sec.hint)}</div>
      <textarea id="designAnswer" class="st-field h180 st-mt12" maxlength="${LIMIT}" placeholder="${esc(EXAMPLE[sec.key])}" aria-label="${esc(sec.title)}">${esc(s.sections[sec.key])}</textarea>`,
    dock: next
      ? `${secondaryBtn("design-submit", "Submit now")}${primaryBtn("design-nav", `Next: ${CHIP[next.key]}`, `data-key="${next.key}"`)}`
      : primaryBtn("design-submit", "Submit design"),
  });

  const box = /** @type {HTMLTextAreaElement} */ (document.getElementById("designAnswer"));
  bindField(box, {
    onChange: (v) => {
      s.sections[sec.key] = v;
      const hint = document.getElementById("designCount");
      if (hint) {
        hint.hidden = v.length <= SHOW_COUNT_AT;
        hint.textContent = `${v.length.toLocaleString()} / ${LIMIT.toLocaleString()}`;
      }
      const n = filledCount(s);
      const count = app.querySelector(".st-count");
      const fill = /** @type {HTMLElement|null} */ (app.querySelector(".st-fill"));
      if (count) count.textContent = `${n} / ${SECTIONS.length}`;
      if (fill) fill.style.width = `${(n / SECTIONS.length) * 100}%`;
    },
  });
  focusEnd(box);

  // Bring the active chip into view with scrollLeft (scrollIntoView would also scroll the page).
  const row = document.getElementById("designChips");
  const chip = row?.querySelector(`[data-chip="${s.activeSectionKey}"]`);
  if (row && chip) {
    const r = row.getBoundingClientRect();
    const c = chip.getBoundingClientRect();
    if (c.left < r.left || c.right > r.right) row.scrollLeft += c.left - r.left - (r.width - c.width) / 2;
  }
}

export function designAction(action, payload) {
  const s = designState;
  if (!s) return;
  if (action === "nav") {
    if (!SECTIONS.some((x) => x.key === payload)) return;
    // The draft is saved on every keystroke, so switching only changes which section shows.
    s.activeSectionKey = payload;
    paintDesignForm();
  } else if (action === "toggle-brief") {
    const el = document.getElementById("briefText");
    const btn = document.getElementById("briefBtn");
    if (!el || !btn) return;
    const clamped = el.classList.toggle("st-clamp");
    btn.textContent = clamped ? "Show full brief" : "Hide full brief";
  } else if (action === "toggle-model") {
    const el = document.getElementById("designModel");
    const btn = document.getElementById("designModelBtn");
    if (!el || !btn) return;
    el.hidden = !el.hidden;
    btn.textContent = el.hidden ? "Compare your approach" : "Hide your approach";
  }
}

export async function submitDesign() {
  const s = designState;
  if (!s || s.grading) return;
  const answer = assembleAnswer(s.sections, "design");
  if (!answer) return toast("Write in at least one section first.");
  // Sections are capped at 2,000 characters each, but the grader takes 4,000 in all.
  if (answerTooLong(answer)) return toast(`Your design is over ${MAX_DESIGN_CHARS.toLocaleString()} characters in total. Trim a section.`);

  paintLoader("Reviewing your design…", `${filledCount(s)} / ${SECTIONS.length}`);
  const token = (s.token = {});
  try {
    const res = await send({ type: "DESIGN_GRADE", mode: "design", task: s.brief, rubric: s.rubric, answer });
    if (designState !== s || s.token !== token) return;
    s.grading = res;
    await Promise.all([
      bumpActivity(1),
      appendReviewLog(drillLogEntry({ kind: "design", sessionId: s.sessionId, fraction: rubricScore(res.rubric_evaluation), id: uid() })),
    ]);
    paintDesignFeedback();
  } catch (e) {
    if (designState !== s || s.token !== token) return;
    toast(e.message);
    paintDesignForm();
  }
}

const SECTION_KIND = { strong: "ok", ok: "ok", weak: "part", missing: "no" };
const POINT_KIND = { covered: "ok", partial: "part", missed: "no" };

function paintDesignFeedback() {
  const s = designState;
  const g = s.grading;
  const byName = new Map((g.sections || []).map((x) => [x.section, x]));

  const rows = SECTIONS.map((sec) => {
    if (!s.sections[sec.key].trim()) return `<div class="st-li roomy">${verdictRow("skip", `${sec.title} · skipped`)}</div>`;
    const v = byName.get(sec.title) || byName.get(sec.key);
    if (!v) return `<div class="st-li roomy">${verdictRow("skip", `${sec.title} · not graded`)}</div>`;
    return `<div class="st-li roomy">${verdictRow(SECTION_KIND[v.verdict] || "no", sec.title)}${v.note ? `<div class="st-feedback">${esc(v.note)}</div>` : ""}</div>`;
  }).join("");

  // The server sends no separate model answer, so this is what a strong answer covers:
  // the brief's rubric, marked against what the learner wrote.
  const points = (g.rubric_evaluation || []).map((p) => `<div class="st-li">${verdictRow(POINT_KIND[p.status] || "no", p.point)}${p.note ? `<div class="st-feedback">${esc(p.note)}</div>` : ""}</div>`).join("");

  const filled = filledCount(s);
  
  const scoreLine = `Score ${g.score} / ${g.maxScore || (g.rubric_evaluation || []).length}`;
  const summaryBlock = feedbackSummary({
    strongest: g.strongestPart,
    gap: g.highestLeverageGap,
    scoreLine
  });

  paintShell({
    mode: "Design brief · ~15 min",
    promptHtml: briefHtml(s),
    progress: 100,
    counter: `${filled} / ${SECTIONS.length}`,
    hasProgress: true,
    body: `
      ${briefToggle}
      
      <div class="st-mt24">${summaryBlock}</div>

      <div class="st-label st-mt24">Sections</div>
      <div class="st-list">${rows}</div>
      <button type="button" class="st-link st-mt12" id="designModelBtn" data-action="design-toggle-model">Compare your approach</button>
      <div id="designModel" hidden>
        <div class="st-label st-mt16">A strong answer covers</div>
        <div class="st-list">${points}</div>
        ${g.next_time ? `<div class="st-label st-mt16">Next time</div><div class="st-text15 st-mt4">${esc(g.next_time)}</div>` : ""}
      </div>`,
    dock: primaryBtn("return-focus", "Done"),
  });
}
