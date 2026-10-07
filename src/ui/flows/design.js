import { getDefaultPracticeStyle } from "../../storage/practice-style.js";
import { app, bundle, esc, send, setFor, toast } from "../core.js";
import { goReturn, setFocusReturn } from "./review.js";
import { showChrome } from "../nav.js";
import { appendReviewLog, bumpActivity, uid } from "../../storage/store.js";
import { drillLogEntry } from "../../storage/drill-log.js";
import { SECTIONS, GUIDED_SECTIONS, answerTooLong, assembleAnswer, emptySections, MAX_DESIGN_CHARS, rubricScore } from "../../storage/design.js";
import { bindField, feedbackSummary, openSuggestionSheet, focusEnd, icon, paintShell, primaryBtn, secondaryBtn, verdictRow, waitRow } from "./shell.js";

// Design brief: one section on screen at a time, a chip row to move between
// them, and a draft per section that autosaves into state. Every section is
// optional. Clinical cases have their own flow (clinical.js).
const LIMIT = 2000;
const SHOW_COUNT_AT = 1600;

// The chip row uses short names; the section titles stay the grader's names.
const CHIP = { requirements: "Requirements", estimates: "Estimates", api: "API", dataModel: "Data model", components: "Components", tradeoffs: "Trade-offs", bottlenecks: "Trade-offs" };
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
  const style = set?.practiceStyle || await getDefaultPracticeStyle() || "guided";

  designState = {
    sessionId,
    practiceStyle: style,
    topic: String(set?.title || "this topic").slice(0, 200),
    cards: cards.map((c) => ({ front: c.front, back: c.back })),
    brief: "",
    rubric: [],
    sections: emptySections("design", style),
    grading: null,
    token: null,
    activeSectionKey: (style === "guided" ? GUIDED_SECTIONS : SECTIONS)[0].key,
    dontKnowLevel: 0,
    conceptChipExpanded: null,
    checkpoint: null,
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
    const res = await send({ type: "DESIGN_TASK", mode: "design", concept: s.topic, reference: s.cards, practiceStyle: s.practiceStyle });
    if (designState !== s || s.token !== token) return;
    s.brief = res.brief;
    s.rubric = res.rubric || [];
    s.constraints = res.constraints || [];
    paintDesignForm();
  } catch (e) {
    if (designState !== s || s.token !== token) return;
    toast(e.message);
    goReturn();
  }
}

const filledCount = (s) => {
  const activeSections = s.practiceStyle === "guided" ? GUIDED_SECTIONS : SECTIONS;
  return activeSections.filter((sec) => s.sections[sec.key] && s.sections[sec.key].trim().length > 0).length;
};

const briefHtml = (s) => `<div class="st-prompt text st-clamp l4" id="briefText">${esc(s.brief)}</div>`;
const briefToggle = `<button type="button" class="st-link st-mt6" id="briefBtn" data-action="design-toggle-brief">Show full brief</button>`;

export function paintDesignForm() {
  const s = designState;
  if (!s) return;
  const isGuided = s.practiceStyle === "guided";
  
  if (isGuided && s.activeSectionKey === "outline") {
    return paintDesignOutline();
  }
  
  const activeSections = isGuided ? GUIDED_SECTIONS : SECTIONS;
  const idx = activeSections.findIndex((sec) => sec.key === s.activeSectionKey);
  const sec = activeSections[idx];
  const next = activeSections[idx + 1];
  const filled = filledCount(s);
  const len = (s.sections[sec.key] || "").length;

  const tabs = activeSections.map((x) => {
    const cur = x.key === s.activeSectionKey;
    const has = (s.sections[x.key] || "").trim().length > 0;
    return `<button type="button" class="st-tab${cur ? " cur" : has ? " done" : ""}" data-action="design-nav" data-key="${x.key}" data-chip="${x.key}"${cur ? ' aria-current="true"' : ""}>${!cur && has ? icon("check", 12, 3) : ""}${esc(CHIP[x.key])}</button>`;
  }).join("");

  // Constraint anchor
  let constraintsHtml = "";
  if (s.constraints && s.constraints.length > 0) {
    constraintsHtml = `<div class="st-pillrow st-mt8" style="position:sticky;top:0;background:var(--bg-primary);padding-top:4px;padding-bottom:4px;z-index:2;cursor:pointer" data-action="design-toggle-brief">${s.constraints.map(c => `<span class="st-pill dim">${esc(c)}</span>`).join("")}</div>`;
  }

  let bodyHtml = "";
  if (isGuided) {
    let chipsHtml = "";
    if (sec.chips) {
      chipsHtml = `
        <div class="st-mt12" style="display:flex;flex-wrap:wrap;gap:8px">
          ${sec.chips.map(c => `<button type="button" class="st-pill ${s.conceptChipExpanded === c ? "active" : ""}" data-action="design-chip" data-key="${esc(c)}">${esc(c)}</button>`).join("")}
        </div>
      `;
      if (s.conceptChipExpanded) {
        let text = "";
        if (s.conceptChipExpanded === "Cache") text = "What would you cache, and when does it go stale?";
        else text = `How would ${s.conceptChipExpanded} apply here?`; // Fallback
        chipsHtml += `<div class="st-note st-mt8">${esc(text)}</div>`;
      }
    }
    
    let hintHtml = "";
    if (s.dontKnowLevel >= 1) hintHtml += `<div class="st-feedback st-mt8">${esc(sec.hint)}</div>`;
    if (s.dontKnowLevel >= 2) hintHtml += `<div class="st-feedback st-mt8">Think about: ${esc(sec.chips.slice(0,2).join(" or "))}.</div>`;
    if (s.dontKnowLevel >= 3 && s.constraints) hintHtml += `<div class="st-feedback st-mt8">Hint: ${esc(s.constraints[0] || "")}</div>`;
    
    bodyHtml = `
      ${constraintsHtml || briefToggle}
      <div class="st-tabs" id="designChips" role="tablist" aria-label="Design sections">${tabs}</div>
      <div class="st-labelrow st-mt24">
        <div style="font-size:17px;font-weight:650">${esc(sec.question)}</div>
        <span class="st-count-hint" id="designCount"${len > SHOW_COUNT_AT ? "" : " hidden"}>${len.toLocaleString()} / ${LIMIT.toLocaleString()}</span>
      </div>
      <div class="st-sub" style="margin-top:4px;font-size:14px;color:var(--text-secondary)">${esc(sec.hint)}</div>
      ${chipsHtml}
      ${hintHtml}
      ${s.checkpoint ? `<div class="st-feedback st-mt12">${esc(s.checkpoint)}</div>` : ""}
      <textarea id="designAnswer" class="st-field st-mt12" style="min-height:96px" maxlength="${LIMIT}" placeholder="${esc(EXAMPLE[sec.key] || "")}" aria-label="${esc(sec.title)}">${esc(s.sections[sec.key] || "")}</textarea>
      <div style="text-align:center" class="st-mt16"><button type="button" class="st-link" data-action="design-submit">Finish early</button></div>`;
  } else {
    bodyHtml = `
      ${constraintsHtml || briefToggle}
      <div class="st-tabs" id="designChips" role="tablist" aria-label="Design sections">${tabs}</div>
      <div class="st-labelrow st-mt24">
        <div style="font-size:17px;font-weight:650">${esc(sec.title)}</div>
        <span class="st-count-hint" id="designCount"${len > SHOW_COUNT_AT ? "" : " hidden"}>${len.toLocaleString()} / ${LIMIT.toLocaleString()}</span>
      </div>
      <div class="st-sub" style="margin-top:4px;font-size:14px;color:var(--text-secondary)">${esc(sec.hint)}</div>
      <textarea id="designAnswer" class="st-field h180 st-mt12" maxlength="${LIMIT}" placeholder="${esc(EXAMPLE[sec.key] || "")}" aria-label="${esc(sec.title)}">${esc(s.sections[sec.key] || "")}</textarea>`;
  }

  let dockHtml = "";
  if (isGuided) {
    if (s.checkpoint) {
      dockHtml = `${secondaryBtn("design-improve", "Improve this")}${primaryBtn("design-nav", "Continue", `data-key="${next ? next.key : "outline"}"`)}`;
    } else {
      dockHtml = `${secondaryBtn("design-dontknow", "I'm not sure")}${s.sections[sec.key]?.trim() ? primaryBtn("design-check", "Check my thinking") : primaryBtn("design-nav", "Continue", `data-key="${next ? next.key : "outline"}"`)}`;
    }
  } else {
    dockHtml = next
      ? `${secondaryBtn("design-submit", "Finish early")}${primaryBtn("design-nav", `Next: ${CHIP[next.key]}`, `data-key="${next.key}"`)}`
      : primaryBtn("design-submit", "Submit design");
  }

  paintShell({
    mode: isGuided ? "Design brief · Learn concepts" : "Design brief · Interview simulation",
    promptHtml: briefHtml(s),
    progress: (filled / activeSections.length) * 100,
    counter: isGuided ? `Step ${idx + 1}/${activeSections.length}` : `${filled} of ${activeSections.length} sections written`,
    hasProgress: filled > 0,
    body: bodyHtml,
    dock: dockHtml,
  });

  const box = /** @type {HTMLTextAreaElement} */ (document.getElementById("designAnswer"));
  bindField(box, {
    onChange: (v) => {
      s.sections[sec.key] = v;
      if (isGuided && !s.checkpoint) {
        const btnCheck = document.querySelector('[data-action="design-check"]');
        const btnNav = document.querySelector('[data-action="design-nav"]');
        if (v.trim()) {
           if (!btnCheck && btnNav) btnNav.outerHTML = primaryBtn("design-check", "Check my thinking");
        } else {
           if (btnCheck) btnCheck.outerHTML = primaryBtn("design-nav", "Continue", `data-key="${next ? next.key : "outline"}"`);
        }
      }
      
      const hint = document.getElementById("designCount");
      if (hint) {
        hint.hidden = v.length <= SHOW_COUNT_AT;
        hint.textContent = `${v.length.toLocaleString()} / ${LIMIT.toLocaleString()}`;
      }
      const n = filledCount(s);
      const count = app.querySelector(".st-count");
      const fill = /** @type {HTMLElement|null} */ (app.querySelector(".st-fill"));
      if (count) {
        count.textContent = isGuided ? `Step ${idx + 1}/${activeSections.length}` : `${n} of ${activeSections.length} sections written`;
      }
      if (fill) fill.style.width = `${(n / activeSections.length) * 100}%`;
    },
  });
  if (!s.checkpoint) focusEnd(box);

  // Bring the active chip into view
  const row = document.getElementById("designChips");
  const chip = row?.querySelector(`[data-chip="${s.activeSectionKey}"]`);
  if (row && chip) {
    const r = row.getBoundingClientRect();
    const c = chip.getBoundingClientRect();
    if (c.left < r.left || c.right > r.right) row.scrollLeft += c.left - r.left - (r.width - c.width) / 2;
  }
}

function paintDesignOutline() {
  const s = designState;
  const activeSections = s.practiceStyle === "guided" ? GUIDED_SECTIONS : SECTIONS;
  const anyEmpty = activeSections.some(sec => !s.sections[sec.key]?.trim());
  
  const outlineHtml = activeSections.map(sec => {
    const val = s.sections[sec.key]?.trim();
    return `
      <div class="st-mt16">
        <div style="font-weight:600;font-size:15px;display:flex;justify-content:space-between">
          <span>${esc(sec.title)}</span>
          <button type="button" class="st-link" data-action="design-nav" data-key="${sec.key}" style="font-size:13px;font-weight:normal">Edit</button>
        </div>
        <div class="st-mt8 st-text15" style="white-space:pre-wrap">${val ? esc(val) : `<span class="dim">Skipped</span>`}</div>
      </div>
    `;
  }).join("");
  
  paintShell({
    mode: "Design brief · Learn concepts",
    progress: 100,
    counter: "Outline",
    hasProgress: true,
    body: `
      <div class="st-labelrow st-mt24"><div style="font-size:17px;font-weight:650">Your design outline</div></div>
      ${outlineHtml}
      ${anyEmpty ? `<div class="st-note st-mt16">Unanswered areas will be marked as skipped.</div>` : ""}
    `,
    dock: `${secondaryBtn("design-submit", "Finish early")}${primaryBtn("design-submit", "Submit design")}`
  });
}

import { getDefaultPracticeStyle } from "../../storage/practice-style.js";
import { app, bundle, esc, send, setFor, toast } from "../core.js";
import { goReturn, setFocusReturn } from "./review.js";
import { showChrome } from "../nav.js";
import { appendReviewLog, bumpActivity, uid } from "../../storage/store.js";
import { drillLogEntry } from "../../storage/drill-log.js";
import { SECTIONS, GUIDED_SECTIONS, answerTooLong, assembleAnswer, emptySections, MAX_DESIGN_CHARS, rubricScore } from "../../storage/design.js";
import { bindField, feedbackSummary, openSuggestionSheet, focusEnd, icon, paintShell, primaryBtn, secondaryBtn, verdictRow, waitRow } from "./shell.js";

// Design brief: one section on screen at a time, a chip row to move between
// them, and a draft per section that autosaves into state. Every section is
// optional. Clinical cases have their own flow (clinical.js).
const LIMIT = 2000;
const SHOW_COUNT_AT = 1600;

// The chip row uses short names; the section titles stay the grader's names.
const CHIP = { requirements: "Requirements", estimates: "Estimates", api: "API", dataModel: "Data model", components: "Components", tradeoffs: "Trade-offs", bottlenecks: "Trade-offs" };
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
  const style = set?.practiceStyle || await getDefaultPracticeStyle() || "guided";

  designState = {
    sessionId,
    practiceStyle: style,
    topic: String(set?.title || "this topic").slice(0, 200),
    cards: cards.map((c) => ({ front: c.front, back: c.back })),
    brief: "",
    rubric: [],
    sections: emptySections("design", style),
    grading: null,
    token: null,
    activeSectionKey: (style === "guided" ? GUIDED_SECTIONS : SECTIONS)[0].key,
    dontKnowLevel: 0,
    conceptChipExpanded: null,
    checkpoint: null,
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
    const res = await send({ type: "DESIGN_TASK", mode: "design", concept: s.topic, reference: s.cards, practiceStyle: s.practiceStyle });
    if (designState !== s || s.token !== token) return;
    s.brief = res.brief;
    s.rubric = res.rubric || [];
    s.constraints = res.constraints || [];
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
  const answer = assembleAnswer(s.sections, "design", s.practiceStyle);
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
      <button type="button" class="st-link st-mt12" id="designSuggestBtn">Turn gaps into review cards</button>

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

  document.getElementById("designSuggestBtn")?.addEventListener("click", () => {
    const gaps = (g.rubric_evaluation || []).filter(p => p.status !== "covered").map(p => ({ type: p.status === "partial" ? "partial_rubric" : "missed_rubric", text: p.point }));
    if (g.highestLeverageGap) gaps.push({ type: "missed_rubric", text: g.highestLeverageGap });
    openSuggestionSheet(s.sessionId, "design", gaps, s.topic, s.cards);
  });
}
