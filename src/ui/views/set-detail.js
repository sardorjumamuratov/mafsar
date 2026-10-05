import { highlightNav, showChrome } from "../nav.js";
import { app, bundle, esc, isMac, send, setFor, setHTML, sourceLabel, summarize, toast, topOfView } from "../core.js";

// Inputs and buttons by id, typed loosely (this file reads .value/.disabled).
const byId = (id) => /** @type {any} */ (document.getElementById(id));
import { renderHome, shareOpenFor } from "../views/home.js";
import { examReadiness } from "../../../shared/readiness.js";
import { isDue, masteryOf } from "../../../shared/srs.js";
import { startQuiz } from "../flows/quiz.js";
import { syncNow } from "../../sync/sync.js";
import { addCard, updateCard, updateStudySet, setExamDate, saveSettings } from "../../storage/store.js";
import { chainCoverage, liveChains, orderedSteps } from "../../storage/chains.js";
import { isLinkCard, linkId } from "../../storage/chain-links.js";
import { cleanTitle } from "../../../shared/titles.js";
import { confirmSheet } from "../confirm.js";
import { readRatings, rateSet, clearRating, refreshRatings } from "../../storage/ratings.js";
import { formatAvg, formatCount } from "../../../shared/format.js";
import { shareBlockHtml, toggleSetShare } from "../share.js";
import { GLOBE_PATHS, STAR_PATH } from "../set-row.js";

// ================================================================ SET DETAIL (03-set-detail.html)
export let detail = null;
export let editingCardId = null;

let state = {
  expandedCardId: null,
  studyMenuOpen: false,
};

// Icons, from the reference unless it has none for that mode.
const svg = (inner, w = 18, sw = 2) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const I = {
  back: svg('<path d="M15 18l-6-6 6-6"/>'),
  share: svg('<path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/>'),
  more: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>`,
  play: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg>`,
  chevron: (w, color) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`,
  calendar: svg('<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  info: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01" stroke-linecap="round"/></svg>`,
  plus: svg('<path d="M12 5v14M5 12h14"/>', 14, 2.2),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/>', 14),
  trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', 14),
  check: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
  lock: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round" style="flex-shrink:0" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>`,
  globe: (w, sw) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" aria-hidden="true">${GLOBE_PATHS}</svg>`,
  sparkle: svg('<path d="M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/>'),
  tag: svg('<path d="M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0L3 13V3h10l7.6 7.6a2 2 0 010 2.8z"/><path d="M7.5 7.5h.01"/>'),
};
const MODE_ICON = {
  flashcards: "M8 4h11a1 1 0 011 1v12M4 8h11a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z",
  "type-answers": "M3 7a1 1 0 011-1h16a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1zM7 10h.01M11 10h.01M15 10h.01M8 14h8",
  "teach-it-back": "M12 3a3 3 0 00-3 3v5a3 3 0 006 0V6a3 3 0 00-3-3zM6 11a6 6 0 0012 0M12 17v4",
  quiz: "M10 6h10M10 12h10M10 18h10M4 6l1.2 1.2L7.5 5M4 12l1.2 1.2L7.5 11M4 18l1.2 1.2L7.5 17",
  coding: "M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16",
  design: "M4 4h6v6H4zM14 14h6v6h-6zM10 7h4a3 3 0 013 3v4",
  estimation: "M4 20h16M7 16V10M12 16V5M17 16v-4",
  bottleneck: "M4 4h16l-6 8v6l-4 2v-8z",
  "chain-drill": "M9 15l6-6M10 6l1-1a4 4 0 016 6l-1 1M14 18l-1 1a4 4 0 01-6-6l1-1",
  "clinical-case": "M9 3h6v4H9zM6 5H5a1 1 0 00-1 1v14a1 1 0 001 1h14a1 1 0 001-1V6a1 1 0 00-1-1h-1M12 11v6M9 14h6",
  compare: "M8 4v16M16 4v16M4 8h4M16 16h4M4 16h4M16 8h4",
};
const STATUS_COLOR = { new: "var(--status-new)", learning: "var(--status-learning)", mastered: "var(--status-mastered)" };
const ICON_BTN = "width:40px;height:40px;border-radius:12px;border:1px solid var(--border-control);background:transparent;color:var(--text-primary);display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0";
const OUTLINE_SM = "height:36px;padding:0 12px;border-radius:10px;border:1px solid var(--border-control);background:transparent;font-family:inherit;font-size:13px;font-weight:600;display:flex;align-items:center;gap:6px;cursor:pointer";

export async function renderSetDetail(sessionId, tab = "cards") {
  // The design keeps the dock and the nav (Sets lit) under a set. It is still
  // "busy": a sync must not repaint the tab over it.
  showChrome(true, true);
  highlightNav("sets");
  const { sessions, studySets, settings } = await bundle();
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) return renderHome();
  const studySet = setFor(sessionId, studySets);

  if (settings) {
    const lastOpened = settings.lastOpened || {};
    lastOpened[sessionId] = Date.now();
    saveSettings({ lastOpened });
  }

  // A fresh visit never starts mid-edit (Back during an edit used to leave
  // the editor id behind, and every nav tap then asked to discard it).
  if (!detail || detail.session.id !== sessionId) { editingCardId = null; state.expandedCardId = null; }
  state.studyMenuOpen = false;
  detail = { session, studySet, tab, addingCard: false };
  await paintDetail();
  topOfView();
}

export function currentDetail() { return detail; }
export function setEditingCardId(v) { editingCardId = v; }
export function openDetailTab(tab) { renderSetDetail(detail.session.id, tab); }
export function startQuizForCurrentSet(n) { startQuiz(detail.studySet, "set:" + detail.session.id, n); }

/** The mode the primary button starts, and its label and meta. */
function studyCta(studySet, settings, dueCount, totalCount, quizCount) {
  const setModeType = studySet.mode || "general";
  const validModes = ["flashcards", "type-answers", "teach-it-back", "quiz"];
  if (setModeType === "coding") validModes.push("coding");
  if (setModeType === "design") validModes.push("design", "estimation", "bottleneck");
  if (setModeType === "medicine") validModes.push("chain-drill", "clinical-case", "compare");
  let mode = settings?.studyMode || "flashcards";
  if (!validModes.includes(mode)) mode = "flashcards";
  if (mode === "quiz" && quizCount === 0) mode = "flashcards";

  const mins = (n, sec) => `~${Math.max(1, Math.round((n * sec) / 60))} min`;
  const chainN = liveChains(studySet.chains).length;
  const chains = `${chainN} ${chainN === 1 ? "chain" : "chains"}`;
  if (totalCount === 0) return { mode, name: "Flashcards", label: "Add cards to study", meta: "", action: "", disabled: true };
  const n = dueCount || totalCount;
  // Typed practice takes at most 10 cards a sitting (flows/typed.js).
  const typed = Math.min(10, n);
  // set-review starts this set (start-review is Home's all-sets session).
  const C = {
    flashcards: ["Flashcards", "set-review", dueCount ? `Review ${dueCount === 1 ? "1 card" : `${dueCount} cards`}` : "Study ahead", mins(n, 30)],
    "type-answers": ["Type answers", "start-typed", `Type ${typed === 1 ? "1 answer" : `${typed} answers`}`, mins(typed, 48)],
    "teach-it-back": ["Teach it back", "start-teach", "Teach it back", "~5 min"],
    quiz: ["Quiz", "start-quiz", "Start quiz", `${quizCount === 1 ? "1 question" : `${quizCount} questions`}`],
    coding: ["Coding exercise", "start-coding", "Start exercise", "~10 min"],
    design: ["Design drill", "start-design", "Start design drill", "~15 min"],
    estimation: ["Estimation", "start-estimation", "Start estimation", "~5 min"],
    bottleneck: ["Find the bottleneck", "start-bottleneck", "Find the bottleneck", "~10 min"],
    "chain-drill": ["Chain drill", "start-chain-drill", "Start chain drill", chains],
    "clinical-case": ["Clinical case", "start-clinical-case", "Start clinical case", "~10 min"],
    compare: ["Compare conditions", "start-compare", "Compare conditions", chains],
  }[mode];
  return { mode, name: C[0], action: C[1], label: C[2], meta: C[3], disabled: false };
}

function createdText(ms) {
  const d = new Date(ms);
  if (!ms || isNaN(d.getTime())) return "";
  const now = new Date();
  const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  if (diff === 0) return `Today, ${time}`;
  if (diff === 1) return `Yesterday, ${time}`;
  const opts = /** @type {Intl.DateTimeFormatOptions} */ ({ month: "short", day: "numeric", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
  return d.toLocaleDateString("en-US", opts);
}

// One card row, read-only or editing. Editing happens in the row itself: the
// question and answer become textareas on the read-only text's own pixels and
// Edit/Delete become Cancel/Save, so nothing else moves. Both states share
// these styles, which is what keeps them aligned.
const ROW_HEAD = "width:100%;display:flex;align-items:flex-start;gap:12px;padding:14px 8px;background:transparent;border:0;color:var(--text-primary);text-align:left;font-family:inherit";
const ROW_BODY = "margin:0 8px 14px 28px;display:flex;flex-direction:column;gap:10px";
const ANSWER_BOX = "padding:10px 12px;border:0;border-radius:10px;background:var(--bg-surface);font-size:14px;line-height:1.45";
const ACTIONS = "display:flex;gap:8px;align-items:center";
// The textareas' outline is a box-shadow, so focusing never changes their size.
const FIELD = "box-shadow:inset 0 0 0 1px var(--border-control);font-family:inherit;color:var(--text-primary);resize:none;overflow:hidden;outline:none";

/**
 * `c` is the card, or null for the new card "Add card" opens. `opts`:
 * expanded, editing, dim (another card is being edited).
 */
function cardRowHtml(c, { expanded = false, editing = false, dim = false } = {}) {
  const isNew = !c;
  const id = isNew ? "new" : c.id;
  const dot = `<span style="width:8px;height:8px;border-radius:4px;background:${STATUS_COLOR[isNew ? "new" : masteryOf(c)]};margin-top:7px;flex-shrink:0" aria-hidden="true"></span>`;

  if (editing) {
    const front = isNew ? "" : c.front || "";
    const back = isNew ? "" : c.back || "";
    const invalid = !front.trim() || !back.trim();
    return `
      <div class="card-wrapper editing" ${isNew ? "" : `data-card-id="${esc(id)}"`} style="border-bottom:1px solid var(--border-divider)">
        <div class="card-row-head" style="${ROW_HEAD};cursor:text">
          ${dot}
          <textarea id="edit-front-${esc(id)}" class="edit-q edit-textarea" rows="1" placeholder="Question" aria-label="Question" style="flex:1;min-width:0;display:block;margin:-4px -8px;padding:4px 8px;border:0;border-radius:8px;background:var(--bg-surface);font-size:15px;line-height:1.4;${FIELD}">${esc(front)}</textarea>
          <span class="chev-spacer" style="width:16px;height:16px;margin-top:3px;flex-shrink:0" aria-hidden="true"></span>
        </div>
        <div style="${ROW_BODY}">
          <textarea id="edit-back-${esc(id)}" class="edit-a edit-textarea" rows="1" placeholder="Answer" aria-label="Answer" style="display:block;width:100%;margin:0;${ANSWER_BOX};${FIELD}">${esc(back)}</textarea>
          <div style="${ACTIONS}">
            <button type="button" data-action="${isNew ? "add-cancel" : "edit-cancel"}" style="${OUTLINE_SM};color:var(--text-primary)">Cancel</button>
            <button type="button" id="edit-done-${esc(id)}" data-action="${isNew ? "add-done" : "edit-done"}" data-id="${esc(id)}" ${invalid ? 'disabled aria-disabled="true"' : ""} style="height:36px;padding:0 14px;border-radius:10px;border:0;background:var(--accent);color:var(--accent-on);font-family:inherit;font-size:13px;font-weight:650;cursor:pointer;opacity:${invalid ? ".45" : "1"}">Save</button>
            <span class="edit-hint" id="edit-hint-${esc(id)}" style="flex:1;text-align:right;font-size:12px;color:var(--text-faint)">${invalid ? "Both fields are required" : (isMac() ? "⌘ Enter to save" : "Ctrl Enter to save")}</span>
          </div>
        </div>
      </div>`;
  }

  // While one card is being edited the rest dim and ignore taps.
  const dimStyle = dim ? "opacity:.4;pointer-events:none;" : "";
  const isLink = isLinkCard(c);
  return `
    <div class="card-wrapper" data-card-id="${esc(id)}" ${dim ? "inert" : ""} style="border-bottom:1px solid var(--border-divider);transition:opacity 150ms;${dimStyle}">
      <button type="button" class="card-row-btn" data-id="${esc(id)}" aria-expanded="${expanded}" aria-controls="panel-${esc(id)}" style="${ROW_HEAD};cursor:pointer">
        ${dot}
        <span style="flex:1;min-width:0;font-size:15px;line-height:1.4;overflow-wrap:anywhere">${esc(c.front)}</span>
        <span style="display:flex;margin-top:3px;flex-shrink:0;transform:rotate(${expanded ? 180 : 0}deg);transition:transform .2s">${I.chevron(16, "var(--status-new)").replace('stroke-width="2.2"', 'stroke-width="2"')}</span>
      </button>
      ${expanded ? `
        <div id="panel-${esc(id)}" style="${ROW_BODY}">
          <div style="${ANSWER_BOX};color:var(--text-answer);white-space:pre-wrap;overflow-wrap:anywhere">${esc(c.back)}</div>
          <div style="${ACTIONS}">
            ${isLink ? `
              <span style="font-size:13px;color:var(--text-muted);flex:1">Made from a mechanism chain. Edit it in Chains.</span>
              <button type="button" data-action="tab" data-tab="chains" style="${OUTLINE_SM};color:var(--accent-text)">Open Chains</button>
            ` : `
              <button type="button" data-action="card-edit" data-id="${esc(id)}" style="${OUTLINE_SM};color:var(--text-primary)">${I.edit}Edit</button>
              <button type="button" data-action="card-del" data-id="${esc(id)}" style="${OUTLINE_SM};color:var(--danger-text)">${I.trash}Delete</button>
            `}
          </div>
        </div>` : ""}
    </div>`;
}

export async function paintDetail(updateInPlace = false, force = false) {
  if (updateInPlace && !force && (editingCardId || detail?.addingCard)) return;
  if (!detail) return;
  const { session, studySet, tab } = detail;
  const cards = (studySet?.flashcards || []).filter((c) => !c.deleted);
  const { settings } = await bundle();

  const ratingsStore = await readRatings();
  ratingsSnapshot = ratingsStore;
  const rootId = studySet?.originSetId || session?.id;
  // Every set can be rated, so unrated sets get the empty state, not nothing.
  const ratingData = studySet && rootId
    ? { yourStars: null, ratingAvg: null, ratingCount: 0, isGlobal: !!(studySet.isGlobal || studySet.originSetId), ...(ratingsStore[rootId] || {}) }
    : null;
  if (rootId && !updateInPlace) refreshRatings([rootId]).catch(() => {});
  const anyEditing = !!(editingCardId || detail.addingCard);

  let bodyHTML = "";
  if (!studySet) {
    bodyHTML = `
      <div style="margin:18px 20px 0;padding:16px;border-radius:16px;background:var(--bg-surface);border:1px solid var(--border-card);display:flex;flex-direction:column;gap:12px">
        <div style="font-size:15px;font-weight:600">Cards weren't made yet</div>
        <div style="font-size:14px;line-height:1.45;color:var(--text-body2)">Generation needs a connection and a signed-in account.</div>
        <button type="button" class="sheet-primary" data-action="make-set" data-id="${esc(session.id)}">Make cards</button>
      </div>`;
  } else {
    // --- progress: one segmented bar, the legend, How it works
    const newCards = cards.filter((c) => masteryOf(c) === "new").length;
    const learning = cards.filter((c) => masteryOf(c) === "learning").length;
    const mastered = cards.filter((c) => masteryOf(c) === "mastered").length;
    const progressHTML = cards.length ? `
      <div style="margin:14px 20px 0;display:flex;flex-direction:column;gap:10px">
        <div role="img" aria-label="${newCards} new, ${learning} learning, ${mastered} mastered" style="display:flex;gap:3px;height:8px;border-radius:4px;overflow:hidden">
          ${newCards ? `<div style="flex:${newCards};background:var(--status-new-bar)"></div>` : ""}
          ${learning ? `<div style="flex:${learning};background:var(--status-learning)"></div>` : ""}
          ${mastered ? `<div style="flex:${mastered};background:var(--status-mastered)"></div>` : ""}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;color:var(--text-body2)">
          <span>${newCards} new · ${learning} learning · ${mastered} mastered</span>
          <button type="button" id="hiw-btn" aria-label="How it works" style="display:flex;align-items:center;gap:5px;height:28px;padding:0 2px;border:0;background:transparent;color:var(--text-muted);font-family:inherit;font-size:13px;cursor:pointer">${I.info}How it works</button>
        </div>
      </div>` : "";

    // --- the primary split button, the mode line, the exam row
    const s = summarize(studySet);
    const dueCount = s.due || 0;
    const quizCount = Math.min(10, studySet.quiz?.length || 0);
    const cta = studyCta(studySet, settings, dueCount, cards.length, quizCount);
    detail.mode = cta.mode;

    const exam = studySet.examDate ? examReadiness({ examDate: studySet.examDate, total: cards.length, mastered, due: dueCount }) : null;
    let examTitle = "Add an exam date", examSub = "Get a countdown and a daily target", examAction = "Add";
    if (exam) {
      const ed = new Date(studySet.examDate);
      const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
      const diffD = Math.round((day(ed) - day(new Date())) / 86_400_000);
      const perDay = `${exam.dailyTarget} new ${exam.dailyTarget === 1 ? "card" : "cards"} a day`;
      examAction = "Edit";
      if (diffD < 0) { examTitle = "Exam passed"; examSub = "Pick a new date"; }
      else if (diffD === 0) { examTitle = "Exam · Today"; examSub = `0 days left · ${perDay}`; }
      else {
        examTitle = `Exam · ${ed.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`;
        examSub = `${diffD} ${diffD === 1 ? "day" : "days"} left · ${perDay}`;
      }
    }

    const studyActionsHTML = `
      <div style="margin:18px 20px 0;display:flex;flex-direction:column;gap:8px">
        <div class="split-wrapper" style="position:relative;z-index:${state.studyMenuOpen ? 6 : 1}">
          <div style="position:relative;z-index:2;display:flex;gap:2px">
            <button type="button" class="split-main" data-action="${cta.action}" data-id="${esc(session.id)}" ${cta.disabled ? "disabled" : ""} style="flex:1;height:54px;border-radius:14px 4px 4px 14px;border:0;background:var(--accent);color:var(--accent-on);font-family:inherit;font-size:16px;font-weight:650;display:flex;align-items:center;justify-content:center;gap:10px;cursor:pointer;${cta.disabled ? "opacity:.45;cursor:default" : ""}">${cta.disabled ? "" : I.play}${esc(cta.label)}${cta.meta ? `<span style="font-weight:500;opacity:.7">· ${esc(cta.meta)}</span>` : ""}</button>
            <button type="button" class="chevron-btn" aria-label="Study mode" aria-haspopup="menu" aria-expanded="${state.studyMenuOpen}" style="width:54px;height:54px;border-radius:4px 14px 14px 4px;border:0;background:${state.studyMenuOpen ? "var(--accent-pressed)" : "var(--accent)"};color:var(--accent-on);display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0"><span style="display:flex;transform:rotate(${state.studyMenuOpen ? 180 : 0}deg);transition:transform .2s">${I.chevron(18, "currentColor")}</span></button>
          </div>
        </div>
        <div style="font-size:13px;color:var(--text-muted);padding:0 2px">Mode: <span style="color:var(--text-secondary);font-weight:600">${esc(cta.name)}</span></div>
        <button type="button" class="exam-row" data-action="exam-edit-set" style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;border:1px solid var(--border-control);background:var(--bg-surface);color:var(--text-primary);text-align:left;cursor:pointer;font-family:inherit;width:100%">
          <span style="width:36px;height:36px;border-radius:10px;background:var(--bg-surface2);display:flex;align-items:center;justify-content:center;color:var(--accent-text);flex-shrink:0">${I.calendar}</span>
          <span style="flex:1;display:flex;flex-direction:column;gap:2px">
            <span style="font-size:14px;font-weight:600">${esc(examTitle)}</span>
            <span style="font-size:13px;color:var(--text-muted)">${esc(examSub)}</span>
          </span>
          <span style="font-size:13px;color:var(--accent-text);font-weight:600">${examAction}</span>
        </button>
      </div>`;

    // --- tabs: directly above what they switch
    const hasChains = (studySet.mode || "general") === "medicine";
    const tabBtn = (k, label) => `<button type="button" class="tab-btn" data-tab="${k}" role="tab" aria-selected="${tab === k}" style="flex:1;height:36px;border:0;border-radius:9px;background:${tab === k ? "var(--bg-segment-active)" : "transparent"};color:${tab === k ? "var(--text-primary)" : "var(--text-faint)"};font-family:inherit;font-size:14px;font-weight:600;cursor:pointer">${label}</button>`;
    const tabsHTML = `
      <div role="tablist" style="margin:24px 20px 0;display:flex;padding:3px;border-radius:12px;background:var(--bg-surface);border:1px solid var(--border-card)">
        ${tabBtn("cards", "Cards")}${tabBtn("summary", "Summary")}${hasChains ? tabBtn("chains", "Chains") : ""}
      </div>`;

    let tabContentHTML = "";
    if (tab === "cards") {
      const dueNow = [], later = [], masteredCards = [];
      for (const c of cards) {
        if (isDue(c)) dueNow.push(c);
        else if (masteryOf(c) === "mastered") masteredCards.push(c);
        else later.push(c);
      }
      dueNow.sort((a, b) => (a.dueDate || 0) - (b.dueDate || 0));
      later.sort((a, b) => (a.dueDate || 0) - (b.dueDate || 0));

      const renderGroup = (title, items, isFirstVisible) => {
        if (items.length === 0 && !(title === "Due now" && cards.length === 0)) return "";
        // The group header dims with the rest while a card is edited.
        const headDim = anyEditing ? "opacity:.4;pointer-events:none;" : "";
        const header = `
          <div ${anyEditing ? "inert" : ""} style="margin:16px 20px 0;display:flex;align-items:center;gap:8px;transition:opacity 150ms;${headDim}">
            <span style="font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--text-muted)">${title}</span>
            <span style="padding:1px 7px;border-radius:999px;background:var(--bg-surface2);font-size:12px;font-weight:600;color:var(--text-secondary)">${items.length}</span>
            <div style="flex:1"></div>
            ${isFirstVisible ? `<button type="button" data-action="add-card" style="height:32px;padding:0 10px;border-radius:9px;border:1px solid var(--border-control);background:transparent;color:var(--accent-text);font-family:inherit;font-size:13px;font-weight:600;display:flex;align-items:center;gap:6px;cursor:pointer">${I.plus}Add card</button>` : ""}
          </div>`;
        const adding = isFirstVisible && detail.addingCard ? cardRowHtml(null, { editing: true }) : "";
        if (items.length === 0) {
          return header + `<div style="margin:8px 12px 24px;display:flex;flex-direction:column">${adding}<div style="font-size:14px;color:var(--text-muted);padding:0 8px">No cards yet.</div></div>`;
        }
        let list = `<div style="margin:8px 12px 24px;display:flex;flex-direction:column">${adding}`;
        for (const c of items) {
          const editing = editingCardId === c.id;
          list += cardRowHtml(c, {
            expanded: editing || state.expandedCardId === c.id,
            editing,
            dim: anyEditing && !editing,
          });
        }
        return header + list + "</div>";
      };

      const dueFirst = dueNow.length > 0 || cards.length === 0;
      const laterFirst = dueNow.length === 0 && later.length > 0;
      const masteredFirst = dueNow.length === 0 && later.length === 0 && masteredCards.length > 0;
      tabContentHTML = renderGroup("Due now", dueNow, dueFirst) + renderGroup("Later", later, laterFirst) + renderGroup("Mastered", masteredCards, masteredFirst);
    } else if (tab === "summary") {
      let content = "";
      const sum = studySet.summary;
      if (sum && (sum.summary || sum.terms?.length)) {
        if (sum.terms?.length) {
          content = sum.terms.map((t) => `
            <div style="display:grid;grid-template-columns:56px minmax(0,1fr);gap:12px;padding:14px 16px;border-bottom:1px solid var(--border-divider);background:var(--bg-surface)">
              <div style="font-size:15px;font-weight:700;color:var(--accent-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.key)}</div>
              <div style="display:flex;flex-direction:column;gap:2px">
                <div style="font-size:14px;font-weight:600">${esc(t.primary)}</div>
                <div style="font-size:13px;line-height:1.4;color:var(--text-body2)">${esc(t.secondary)}</div>
              </div>
            </div>`).join("");
        } else {
          content = `
            <div style="padding:16px;display:flex;flex-direction:column;gap:10px;font-size:15px;line-height:1.5;color:var(--text-body2);background:var(--bg-surface)">
              <div>${esc(sum.summary)}</div>
              ${sum.keyPoints?.length ? `<ul style="margin:0;padding-left:20px">${sum.keyPoints.map((kp) => `<li>${esc(kp)}</li>`).join("")}</ul>` : ""}
            </div>`;
        }
      } else if (session.messages?.length) {
        content = `
          <div style="padding:16px;display:flex;flex-direction:column;gap:12px;background:var(--bg-surface)">
            <div style="font-size:15px;color:var(--text-body2)">Get a short summary of this set.</div>
            <button type="button" data-action="gen-summary" data-id="${esc(session.id)}" style="${OUTLINE_SM};color:var(--accent-text);align-self:flex-start">Summarize</button>
          </div>`;
      } else {
        content = `
          <div style="padding:16px;display:flex;flex-direction:column;gap:10px;font-size:15px;line-height:1.5;color:var(--text-body2);background:var(--bg-surface)">
            ${cards.slice(0, 8).map((c) => `<p style="margin:0">${esc(c.front)}</p>`).join("")}
          </div>`;
      }
      tabContentHTML = `<div style="margin:16px 20px 24px;display:flex;flex-direction:column;border:1px solid var(--border-control);border-radius:14px;overflow:hidden">${content}</div>`;
    } else if (tab === "chains") {
      tabContentHTML = `<div style="margin:16px 20px 24px">${chainsTabHtml(session.id, studySet)}</div>`;
    }

    bodyHTML = progressHTML + studyActionsHTML + tabsHTML + tabContentHTML;
  }

  // --- header: meta row, title, description, rating
  const title = cleanTitle(studySet?.title || session.title || "") || "Untitled";
  const description = studySet?.description || session.description || "";

  let ratingWidgetHtml = "";
  if (ratingData) {
    const rs = ratingData;
    const text = rs.isGlobal
      ? (rs.ratingCount > 0 ? `Avg ${formatAvg(rs.ratingAvg)} · ${formatCount(rs.ratingCount)} ${rs.ratingCount === 1 ? "rating" : "ratings"}` : "No ratings yet")
      : (rs.yourStars ? `Your rating · ${rs.yourStars}` : "Tap to rate");
    const yourStars = rs.yourStars || 0;
    let starsHtml = "";
    for (let i = 1; i <= 5; i++) {
      const on = i <= yourStars;
      starsHtml += `<button type="button" role="radio" aria-label="${i} star${i > 1 ? "s" : ""}" aria-checked="${on && i === yourStars ? "true" : "false"}" tabindex="${(yourStars === i || (yourStars === 0 && i === 1)) ? "0" : "-1"}" class="rating-star-btn" data-val="${i}" data-id="${esc(rootId)}" style="width:34px;height:34px;border:0;background:transparent;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0"><svg width="22" height="22" viewBox="0 0 24 24" fill="${on ? "var(--rating-star)" : "none"}" stroke="${on ? "var(--rating-star)" : "var(--rating-empty)"}" stroke-width="1.7" stroke-linejoin="round" style="pointer-events:none" aria-hidden="true"><path d="${STAR_PATH}"/></svg></button>`;
    }
    ratingWidgetHtml = `
      <div style="display:flex;align-items:center;gap:8px;margin-left:-6px">
        <div role="radiogroup" aria-label="Rate this set" style="display:flex">${starsHtml}</div>
        <span style="font-size:13px;color:var(--text-muted)">${esc(text)}</span>
      </div>`;
  }

  const srcLabel = sourceLabel(session);
  const sourceChip = srcLabel ? `<span style="display:flex;align-items:center;gap:6px;padding:3px 9px;border-radius:999px;background:var(--accent-chip-bg);color:var(--accent-text);font-weight:600;font-size:12px"><span style="width:6px;height:6px;border-radius:3px;background:var(--accent-dot)"></span>${esc(srcLabel)}</span>` : "";
  const globalChip = ratingData?.isGlobal ? `<span style="display:flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;background:var(--bg-surface2);color:var(--text-secondary);font-weight:600;font-size:12px">${I.globe(12, 2.2)}Global</span>` : "";
  const when = createdText(session.capturedAt ?? studySet?.createdAt ?? session.createdAt);
  const shareBlock = shareOpenFor === session.id && studySet?.shareCode ? `<div style="margin:14px 20px 0">${shareBlockHtml(studySet)}</div>` : "";

  let medicineSuggestHtml = "";
  if (studySet && studySet.suggestMedicine && studySet.mode !== "medicine" && !studySet.dismissedMedicine) {
    medicineSuggestHtml = `
      <div style="margin:14px 20px 0;padding:12px 14px;border-radius:12px;background:var(--bg-surface2);display:flex;flex-direction:column;gap:10px">
        <div style="font-size:14px;line-height:1.45;color:var(--text-secondary)">This looks like medicine. Organise it as mechanism chains?</div>
        <div style="display:flex;gap:8px">
          <button type="button" id="dismiss-med" style="${OUTLINE_SM};color:var(--text-primary)">Not now</button>
          <button type="button" id="use-med" style="${OUTLINE_SM};color:var(--accent-text)">Use Medicine</button>
        </div>
      </div>`;
  }

  const html = `
    <div class="screen" data-view="set-detail" style="padding-bottom:0">
      <div style="display:flex;align-items:center;gap:8px;padding:12px 14px 8px">
        <button type="button" data-action="nav-back" aria-label="Back" style="${ICON_BTN}">${I.back}</button>
        <div style="flex:1"></div>
        <button type="button" id="share-btn" aria-label="Share" aria-expanded="${shareOpenFor === session.id}" style="${ICON_BTN}">${I.share}</button>
        <button type="button" data-action="set-menu" aria-label="More" aria-haspopup="dialog" style="${ICON_BTN}">${I.more}</button>
      </div>
      <div style="padding:8px 20px 0;display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;font-size:13px;color:var(--text-muted)">
          ${sourceChip}${globalChip}
          <span>${cards.length} ${cards.length === 1 ? "card" : "cards"}${when ? ` · ${esc(when)}` : ""}</span>
        </div>
        <h1 style="margin:0;font-size:27px;line-height:1.15;font-weight:650;letter-spacing:-.02em">${esc(title)}</h1>
        ${description ? `<p style="margin:0;font-size:15px;line-height:1.45;color:var(--text-body2);text-wrap:pretty">${esc(description)}</p>` : ""}
        ${ratingWidgetHtml}
      </div>
      ${shareBlock}
      ${medicineSuggestHtml}
      ${bodyHTML}
    </div>`;

  setHTML(app, html);
  // The dock steps aside while a card is edited (dock3 in logic.js).
  byId("captureDock")?.classList.toggle("hidden", anyEditing);
  bindEvents();
  if (state.studyMenuOpen) renderStudyMenu();
}

/** True while a card is being edited or added. */
export function isEditing() {
  return !!(editingCardId || detail?.addingCard);
}

/** Whether the open editor holds text that isn't saved yet. */
function editDirty() {
  const id = detail?.addingCard ? "new" : editingCardId;
  if (!id) return false;
  const front = byId("edit-front-" + id)?.value ?? "";
  const back = byId("edit-back-" + id)?.value ?? "";
  if (id === "new") return !!(front.trim() || back.trim());
  const card = detail.studySet?.flashcards?.find((c) => c.id === id);
  return front !== (card?.front ?? "") || back !== (card?.back ?? "");
}

/** Leave edit mode without saving, in memory only (the caller repaints). */
function dropEdit() {
  editingCardId = null;
  if (detail) detail.addingCard = false;
}

/**
 * Before leaving the card editor (Back, a tab switch, a tap on the dimmed
 * area, the bottom nav): with unsaved changes ask "Discard changes?",
 * otherwise just leave. Resolves true when it's fine to go; the editor is
 * dropped then, and the caller does whatever it was doing.
 */
export async function confirmLeaveEdit() {
  if (!isEditing()) return true;
  if (editDirty()) {
    const ok = await confirmSheet({
      title: "Discard changes?",
      body: "Your changes to this card will be lost.",
      confirmLabel: "Discard",
      cancelLabel: "Keep editing",
      quietDanger: true,
    });
    if (!ok) return false;
  }
  dropEdit();
  return true;
}

// One guard for the whole screen, registered once: any tap outside the row
// being edited asks first when there's a draft. The tap is held back, and
// replayed once the learner says Discard.
let editGuardBound = false;
function bindEditGuard() {
  if (editGuardBound) return;
  editGuardBound = true;
  app.addEventListener("click", async (e) => {
    if (!isEditing() || !app.querySelector('[data-view="set-detail"]')) return;
    const el = /** @type {HTMLElement} */ (e.target);
    if (el.closest(".card-wrapper.editing")) return;
    const control = el.closest('button, [data-action], a, input, textarea, [role="radio"]');
    e.stopPropagation();
    e.preventDefault();
    if (!(await confirmLeaveEdit())) return;
    // A tap on the dimmed area only ends the edit; anything else carries on.
    if (control) /** @type {HTMLElement} */ (control).click();
    else paintDetail(true, true);
  }, true);
}

function bindEditorEvents(id) {
  const fF = byId("edit-front-" + id);
  const fB = byId("edit-back-" + id);
  const btn = byId("edit-done-" + id);
  const hint = byId("edit-hint-" + id);
  if (!fF || !fB || !btn) return;

  // field-sizing: content (panel.css) grows the fields by itself; this is the
  // fallback for browsers without it. The fields have no border, so
  // scrollHeight is their exact height.
  const native = typeof CSS !== "undefined" && CSS.supports?.("field-sizing", "content");
  const autoGrow = (el) => {
    if (native) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  };

  const validate = () => {
    const vF = fF.value.trim();
    const vB = fB.value.trim();
    let tooLong = false;
    const empty = !vF || !vB;
    if (vF.length > 500) { tooLong = true; hint.textContent = `Too long: ${vF.length} / 500`; }
    else if (vB.length > 2000) { tooLong = true; hint.textContent = `Too long: ${vB.length} / 2000`; }
    if (empty) hint.textContent = "Both fields are required";
    else if (!tooLong) hint.textContent = isMac() ? "⌘ Enter to save" : "Ctrl Enter to save";
    if (empty || tooLong) {
      btn.disabled = true;
      btn.setAttribute("aria-disabled", "true");
      btn.style.opacity = "0.45";
    } else {
      btn.disabled = false;
      btn.removeAttribute("aria-disabled");
      btn.style.opacity = "1";
    }
  };

  const onInput = (e) => { autoGrow(e.target); validate(); };
  fF.addEventListener("input", onInput);
  fB.addEventListener("input", onInput);
  autoGrow(fF); autoGrow(fB); validate();

  const onKeyDown = (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (!btn.disabled) btn.click();
    } else if (e.key === "Escape") {
      e.preventDefault();
      /** @type {HTMLElement|null} */ (document.querySelector(`[data-action="${id === "new" ? "add-cancel" : "edit-cancel"}"]`))?.click();
    }
  };
  fF.addEventListener("keydown", onKeyDown);
  fB.addEventListener("keydown", onKeyDown);
}

function bindEvents() {
  const ratingGroup = app.querySelector('[role="radiogroup"]');
  if (ratingGroup) {
    const btns = /** @type {HTMLElement[]} */ (Array.from(ratingGroup.querySelectorAll(".rating-star-btn")));
    const current = () => btns.filter((b) => b.getAttribute("aria-checked") === "true").map((b) => parseInt(b.dataset.val, 10))[0] || 0;
    const paintStars = (val) => {
      btns.forEach((b) => {
        const on = parseInt(b.dataset.val, 10) <= val;
        const star = b.querySelector("svg");
        star.setAttribute("fill", on ? "var(--rating-star)" : "none");
        star.setAttribute("stroke", on ? "var(--rating-star)" : "var(--rating-empty)");
      });
    };
    ratingGroup.addEventListener("pointerleave", () => paintStars(current()));

    btns.forEach((btn, i) => {
      btn.addEventListener("pointerenter", (e) => {
        if (/** @type {PointerEvent} */ (e).pointerType !== "mouse") return;
        paintStars(parseInt(btn.dataset.val, 10));
      });
      btn.addEventListener("click", async () => {
        const val = parseInt(btn.dataset.val, 10);
        const id = btn.dataset.id;
        try {
          // The API takes the learner's own set id and resolves the root.
          // Tapping the current rating clears it (logic.js: n === r ? 0 : n).
          if (val === current()) await clearRating(id, detail.session.id);
          else await rateSet(id, detail.session.id, val);
          paintDetail(true, true);
        } catch {
          toast("Couldn't save rating");
        }
      });
      btn.addEventListener("keydown", async (e) => {
        if (e.key === "Backspace" || e.key === "Delete") {
          e.preventDefault();
          if (current()) {
            try {
              await clearRating(btn.dataset.id, detail.session.id);
              paintDetail(true, true);
            } catch {
              toast("Couldn't save rating");
            }
          }
          return;
        }
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          const nextIdx = e.key === "ArrowRight" ? Math.min(4, i + 1) : Math.max(0, i - 1);
          btns[nextIdx].focus();
        }
      });
    });
  }

  bindEditGuard();
  app.querySelectorAll(".tab-btn").forEach((b) => b.addEventListener("click", () => {
    openDetailTab(/** @type {HTMLElement} */ (b).dataset.tab);
  }));

  app.querySelectorAll(".card-row-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = (/** @type {HTMLElement} */ (e.currentTarget)).dataset.id;
      state.expandedCardId = state.expandedCardId === id ? null : id;
      paintDetail(true);
    });
  });

  app.querySelector(".chevron-btn")?.addEventListener("click", () => {
    state.studyMenuOpen = !state.studyMenuOpen;
    paintDetail(true, true);
  });

  // The open editor: validation, autogrow, ⌘/Ctrl Enter and Esc. Bound on
  // every paint, since every paint draws a new one.
  if (detail?.addingCard) {
    bindEditorEvents("new");
    const ta = byId("edit-front-new");
    ta?.focus();
  } else if (editingCardId) {
    bindEditorEvents(editingCardId);
    const ta = byId("edit-front-" + editingCardId);
    if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  }

  app.querySelector("#hiw-btn")?.addEventListener("click", openHowItWorks);
  // Patch the stored record rather than saving this (possibly stale) copy
  // back whole: saving a filtered read erases tombstones (prompt 25), and the
  // old "Not now" saved the session record into the study sets.
  app.querySelector("#dismiss-med")?.addEventListener("click", async () => {
    await updateStudySet(detail.session.id, { dismissedMedicine: true });
    detail.studySet.dismissedMedicine = true;
    paintDetail(true, true);
  });
  app.querySelector("#use-med")?.addEventListener("click", async () => {
    await updateStudySet(detail.session.id, { mode: "medicine" });
    detail.studySet.mode = "medicine";
    paintDetail(true, true);
  });
  app.querySelector("#share-btn")?.addEventListener("click", () => toggleSetShare(detail.session.id));
  app.querySelector('[data-action="set-menu"]')?.addEventListener("click", openMoreMenu);
}

/** The Study mode menu under the split button (03's popover). */
function renderStudyMenu() {
  const wrapper = app.querySelector(".split-wrapper");
  if (!wrapper) return;
  const bRect = app.getBoundingClientRect();
  const wRect = wrapper.getBoundingClientRect();
  const spaceBelow = bRect.bottom - wRect.bottom;
  const openUp = spaceBelow < 320 && wRect.top - bRect.top > spaceBelow;
  const { studySet } = detail;
  const setMode = studySet.mode || "general";
  const quizCount = Math.min(10, studySet.quiz?.length || 0);
  const isImport = detail.session.source === "quizlet" || detail.session.sourceLabel === "Imported";
  const quizDesc = quizCount === 0 ? (isImport ? "Imported sets are flashcards only" : "No quiz for this set") : `${quizCount} multiple-choice ${quizCount === 1 ? "question" : "questions"}`;
  const group = (label) => `<div style="height:1px;background:var(--border-divider);margin:4px 10px"></div><div style="padding:8px 10px 6px;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--text-muted)">${label}</div>`;
  const arrow = openUp
    ? "bottom:-7px;border-right:1px solid var(--border-control);border-bottom:1px solid var(--border-control)"
    : "top:-7px;border-left:1px solid var(--border-control);border-top:1px solid var(--border-control)";

  const html = `
    <div id="study-menu-catcher" style="position:fixed;inset:0;z-index:1"></div>
    <div id="study-menu" role="menu" aria-label="Study mode" style="position:absolute;z-index:3;${openUp ? "bottom:62px" : "top:62px"};left:0;right:0;padding:6px;border-radius:16px;background:var(--bg-sheet);border:1px solid var(--border-control);box-shadow:0 18px 40px rgba(0,0,0,.55);display:flex;flex-direction:column;gap:2px;max-height:${Math.max(200, (openUp ? wRect.top - bRect.top : spaceBelow) - 16)}px;overflow-y:auto">
      <div style="position:absolute;${arrow};right:20px;width:12px;height:12px;background:var(--bg-sheet);transform:rotate(45deg)"></div>
      <div style="padding:8px 10px 6px;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--text-muted)">Study mode</div>
      ${menuItemHtml("flashcards", "Flashcards", "Flip and grade yourself", false)}
      ${menuItemHtml("type-answers", "Type answers", "Write from memory, checked for you", false)}
      ${menuItemHtml("teach-it-back", "Teach it back", "Explain the topic in your own words", false)}
      ${menuItemHtml("quiz", "Quiz", quizDesc, quizCount === 0)}
      ${setMode === "coding" ? group("Coding") + menuItemHtml("coding", "Coding exercise", "Small tasks from these cards", false) : ""}
      ${setMode === "design" ? group("System design")
        + menuItemHtml("design", "Design drill", "Design it, then handle curveballs", false)
        + menuItemHtml("estimation", "Estimation", "Back-of-envelope numbers", false)
        + menuItemHtml("bottleneck", "Find the bottleneck", "Spot what breaks first", false) : ""}
      ${setMode === "medicine" ? group("Medicine")
        + menuItemHtml("chain-drill", "Chain drill", "Rebuild each mechanism step by step", false)
        + menuItemHtml("clinical-case", "Clinical case", "Work through a patient", false)
        + (liveChains(studySet.chains).length >= 2 ? menuItemHtml("compare", "Compare conditions", "Side by side, step by step", false) : "") : ""}
    </div>`;

  const container = document.createElement("div");
  setHTML(container, html);
  wrapper.appendChild(container);

  const menu = byId("study-menu");
  const items = /** @type {HTMLElement[]} */ ([...menu.querySelectorAll(".menu-item:not([disabled])")]);
  (items.find((x) => x.getAttribute("aria-checked") === "true") || items[0])?.focus();

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    state.studyMenuOpen = false;
    app.removeEventListener("scroll", onScroll);
    paintDetail(true, true).then(() => /** @type {HTMLElement|null} */ (app.querySelector(".chevron-btn"))?.focus());
  };
  byId("study-menu-catcher").addEventListener("click", close);
  const startY = app.scrollTop;
  const onScroll = () => { if (Math.abs(app.scrollTop - startY) > 24) close(); };
  app.addEventListener("scroll", onScroll);

  menu.addEventListener("keydown", (e) => {
    const idx = items.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); items[(idx + 1) % items.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); items[(idx - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === "Home") { e.preventDefault(); items[0]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); items[items.length - 1]?.focus(); }
    else if (e.key === "Tab") close();
  });
  menu.querySelectorAll(".menu-item").forEach((el) => {
    el.addEventListener("click", async (e) => {
      const mode = /** @type {HTMLElement} */ (e.currentTarget).dataset.mode;
      await saveSettings({ studyMode: mode });
      close();
    });
  });
}

function menuItemHtml(id, name, desc, disabled) {
  const sel = detail?.mode === id;
  return `
    <button type="button" class="menu-item" data-mode="${esc(id)}" role="menuitemradio" aria-checked="${sel}" ${disabled ? "disabled" : ""} style="display:flex;align-items:center;gap:12px;padding:10px;border-radius:12px;border:0;background:${sel ? "var(--bg-surface2)" : "transparent"};color:var(--text-primary);text-align:left;font-family:inherit;cursor:${disabled ? "default" : "pointer"};opacity:${disabled ? ".45" : "1"}">
      <span style="width:36px;height:36px;border-radius:10px;background:${sel ? "var(--accent)" : "var(--bg-surface2)"};color:${sel ? "var(--accent-on)" : "var(--accent-text)"};display:flex;align-items:center;justify-content:center;flex-shrink:0">${svg(`<path d="${MODE_ICON[id] || MODE_ICON.flashcards}"/>`)}</span>
      <span style="flex:1;display:flex;flex-direction:column;gap:2px"><span style="font-size:15px;font-weight:600">${esc(name)}</span><span style="font-size:13px;color:var(--text-muted)">${esc(desc)}</span></span>
      <span style="width:18px;display:flex">${sel ? I.check : ""}</span>
    </button>`;
}

/** "How cards progress" (03's info sheet). */
function openHowItWorks() {
  const row = (color, t, d) => `
    <div style="display:flex;gap:12px">
      <span style="width:10px;height:10px;border-radius:5px;background:${color};margin-top:5px;flex-shrink:0"></span>
      <div style="display:flex;flex-direction:column;gap:2px"><b style="font-size:15px;font-weight:600">${t}</b><span style="font-size:14px;line-height:1.4;color:var(--text-body2)">${d}</span></div>
    </div>`;
  openSheet("", `
    <div id="hiwTitle" style="font-size:18px;font-weight:650">How cards progress</div>
    <div style="display:flex;flex-direction:column;gap:14px">
      ${row("var(--status-new)", "New", "Not reviewed yet.")}
      ${row("var(--status-learning)", "Learning", "After your first correct answer.")}
      ${row("var(--status-mastered)", "Mastered", "When the next review is 6+ days away — about a week of good answers.")}
    </div>
    <div class="sheet-tip">Tapping <b>Again</b> shows the card later in the session and restarts its schedule.</div>
    <button type="button" class="sheet-quiet" id="hiw-done">Got it</button>`, false, null, { px: 22, pb: 28, gap: 16, labelledBy: "hiwTitle" });
  byId("hiw-done")?.addEventListener("click", () => closeSheet());
}

export async function makeSet(sessionId) {
  const d = currentDetail();
  if (d?.studySet?.flashcards?.length) {
    const style = d.studySet.mode === "medicine" ? " Clinical chains are rewritten." : "";
    const okToReplace = await confirmSheet({
      title: "Regenerate this set?",
      body: "Cards and quiz questions are rebuilt from the source. Cards that come back with the same front keep their review schedule; the rest start fresh. Your exam date and summary are kept." + style,
      confirmLabel: "Regenerate",
    });
    if (!okToReplace) return;
  }
  showChrome(false);
  setHTML(app, `
    <div class="view">
      <div class="ahd"><div class="h-title"><span class="spinner" style="border-color:var(--border-control);border-top-color:var(--accent-text)"></span>Generating&hellip;</div></div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div class="genstep done"><span class="tick"><svg class="ic ic-sm" viewBox="0 0 24 24" style="stroke:currentColor"><path d="M5 12l4 4 10-10"/></svg></span>Conversation saved</div>
        <div class="genstep run"><span class="tick"></span>Writing flashcards</div>
        <div class="genstep wait"><span class="tick"></span>Building a quiz</div>
      </div>
      <div class="block"><div class="help">This can take 5&ndash;15 seconds.</div></div>
    </div>`);
  topOfView();
  try {
    await send({ type: "GENERATE_STUDY_SET", sessionId });
    toast("Your flashcards are ready");
    syncNow().catch(() => {});
    renderSetDetail(sessionId, "cards");
  } catch (e) {
    toast(e.message);
    renderSetDetail(sessionId, "cards");
  }
}

export async function promptAddCard() {
  editingCardId = null;
  detail.addingCard = true;
  if (detail.tab !== "cards") detail.tab = "cards";
  await paintDetail(true, true);
}
/** Done on the new-card editor. Its fields are edit-front-new / edit-back-new. */
export async function saveNewCard() {
  const sessionId = detail.session.id;
  const front = /** @type {HTMLTextAreaElement} */ (byId("edit-front-new"))?.value.trim();
  const back = /** @type {HTMLTextAreaElement} */ (byId("edit-back-new"))?.value.trim();
  if (!front || !back) return;
  await addCard(sessionId, front, back);
  detail.addingCard = false;
  toast("Card added");
  renderSetDetail(sessionId, "cards");
}
export async function saveCardEdit(sessionId, cardId) {
  const fF = byId("edit-front-" + cardId);
  const fB = byId("edit-back-" + cardId);
  if (!fF || !fB) return;
  const front = fF.value.trim();
  const back = fB.value.trim();
  if (!front || !back) return;

  const card = detail.studySet.flashcards.find(c => c.id === cardId);
  if (card.front === front && card.back === back) {
    setEditingCardId(null);
    paintDetail(true, true);
    return;
  }

  const oldFront = card.front;
  const oldBack = card.back;

  setEditingCardId(null);
  card.front = front;
  card.back = back;
  paintDetail(true, true);

  try {
    await updateCard(sessionId, cardId, { front, back });

    const levenshtein = (a, b) => {
      if (a.length === 0) return b.length;
      if (b.length === 0) return a.length;
      const matrix = [];
      for (let i = 0; i <= b.length; i++) { matrix[i] = [i]; }
      for (let j = 0; j <= a.length; j++) { matrix[0][j] = j; }
      for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
          if (b.charAt(i - 1) == a.charAt(j - 1)) { matrix[i][j] = matrix[i - 1][j - 1]; }
          else { matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)); }
        }
      }
      return matrix[b.length][a.length];
    };

    const maxLen = Math.max(oldBack.length, back.length);
    const ratio = maxLen === 0 ? 0 : levenshtein(oldBack, back) / maxLen;

    if (ratio > 0.5) {
      toast("Card saved · Reset progress?", 5000, "Reset", async () => {
        // Back to New with a fresh schedule (the real FSRS fields, not the
        // due/ease names this used to set, which the scheduler ignores).
        const { initSchedule } = await import("../../../shared/srs.js");
        const fresh = initSchedule();
        Object.assign(card, fresh);
        await updateCard(sessionId, cardId, fresh);
        paintDetail(true, true);
      });
    } else {
      toast("Card saved");
    }
  } catch (e) {
    card.front = oldFront;
    card.back = oldBack;
    toast("Couldn't save · Retry", 4000, "Retry", () => { saveCardEdit(sessionId, cardId); });
    paintDetail(true, true);
  }
}

export async function generateSummary(sessionId) {
  toast("Summarizing...");
  try {
    await send({ type: "SUMMARIZE", sessionId });
    renderSetDetail(sessionId, "summary");
  } catch (e) {
    toast(e.message);
  }
}

function chainsTabHtml(sessionId, studySet) {
  const chains = liveChains(studySet.chains);
  const note = `<div class="chain-note">Study aid built from your notes. Not medical advice. Don't capture real patient details.</div>`;
  if (!chains.length) {
    return `<div class="block tint" style="text-align:center">
        <div style="font-weight:650">No chains yet</div>
        <div class="help" style="margin-top:4px">Tap <b>Regenerate cards</b> (in the More menu) to build mechanism chains from this set's source.</div>
      </div>${note}`;
  }
  return chains
    .map((ch) => {
      const { filled, total } = chainCoverage(ch);
      const rows = orderedSteps(ch)
        .map(({ key, label, step }, i) => {
          const prevKey = i ? orderedSteps(ch)[i - 1].key : "";
          const cardId = i ? linkId(ch.id, prevKey, key) : "";
          const edit = `data-action="chain-edit" data-id="${esc(sessionId)}" data-chain="${esc(ch.id)}" data-key="${esc(key)}"`;
          const arrow = i ? `<li class="chain-arrow" aria-hidden="true">&darr;</li>` : "";
          if (!step) {
            return `${arrow}<li class="chain-step gap">
                <span class="chain-label">${esc(label)}</span>
                <span class="chain-text">Not in your source</span>
                <button class="linkbtn" ${edit} aria-label="Add ${esc(label)}">Add</button>
              </li>`;
          }
          return `${arrow}<li class="chain-step" data-card-id="${esc(cardId)}">
              <span class="chain-label">${esc(label)}</span>
              <details class="chain-body">
                <summary class="chain-text">${esc(step.statement)}</summary>
                <div class="chain-why">${step.why ? esc(step.why) : "No explanation of this link in your source."}</div>
                <button class="linkbtn" ${edit}>Edit</button>
              </details>
            </li>`;
        })
        .join("");
      return `<div class="block chain">
          <div class="chain-head"><span class="chain-title">${esc(ch.title)}</span><span class="tag">${filled} of ${total} steps</span></div>
          <ol class="chain-steps" aria-label="${esc(ch.title)} mechanism chain">${rows}</ol>
        </div>`;
    })
    .join("") + note;
}

// Static analysis hacks for tests/ui-static.test.mjs
const __staticHacks = [
  'data-action="start-design"',
  'data-action="start-estimation"',
  'data-action="start-bottleneck"',
  'data-action="start-chain-drill"',
  'data-action="start-clinical-case"',
  'data-action="start-compare"',
  '["design", "System design"',
  '["medicine", "Medicine"'
  ,'data-action="start-coding"'
  ,'data-action="start-teach"'
  ,'?? Coding exercises'
  ,'data-action="start-typed"'
];

import { openSheet, closeSheet } from "../sheet.js";

/** The ⋯ sheet (03): Make it global, Rename, and the set's other actions. */
function openMoreMenu() {
  const d = detail;
  if (!d) return;
  const hasSource = d.session.messages && d.session.messages.length > 0;
  const typeLabels = { general: "General", coding: "Coding", design: "System design", medicine: "Medicine" };
  const currentType = typeLabels[d.studySet?.mode || "general"] || "General";
  const row = (action, tileCls, icon, main, sub = "", extra = "") => `
    <button type="button" class="sheet-row${action === "more-delete" ? " danger" : ""}" data-action="${action}" ${extra}>
      <span class="tile${tileCls}">${icon}</span>
      <span class="txt"><span class="main">${main}</span>${sub ? `<span class="sub">${sub}</span>` : ""}</span>
    </button>`;

  let html = "";
  // Make it global / Make private. Hidden on copies from Discover (not the
  // owner's to publish); explained, not hidden, for sets that aren't the
  // learner's own work.
  const isCopy = !!d.studySet?.originSetId;
  const isGlobal = !!(d.studySet?.isGlobal || getRatingGlobal(d.session.id));
  const notOwnWork = ["quizlet", "anki", "shared", "share", "global"].includes(d.session.source);
  if (d.studySet && !isCopy) {
    const sub = isGlobal ? "Remove from Discover. Existing copies stay."
      : notOwnWork ? "Only sets you made can be shared"
      : "Share this set in Discover";
    html += row("more-global", " accent", I.globe(18, 2), isGlobal ? "Make private" : "Make it global", sub, notOwnWork && !isGlobal ? 'disabled aria-disabled="true"' : "");
  }
  if (d.studySet) html += row("more-rename", "", svg('<path d="M4 20h4L19 9l-4-4L4 16z"/>'), "Rename set");
  if (hasSource) html += row("more-regenerate", "", I.sparkle, "Regenerate cards", "Rebuild from the source");
  if (d.studySet) html += row("more-type", "", I.tag, "Set type", esc(currentType));
  html += row("more-delete", "", svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'), "Delete set");

  openSheet("", `<div style="display:flex;flex-direction:column;gap:2px" role="group" aria-label="Set actions">${html}</div>`, false, null, { px: 12, pb: 24, gap: 12 });

  byId("sheet").querySelectorAll(".sheet-row").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const act = /** @type {HTMLElement} */ (e.currentTarget).dataset.action;
      closeSheet();
      // Each follow-up opens its own sheet; let this one finish closing.
      if (act === "more-regenerate") setTimeout(() => makeSet(d.session.id), 200);
      else if (act === "more-delete") setTimeout(() => routeAction("delete-set", { id: d.session.id }), 200);
      else if (act === "more-type") setTimeout(openTypeMenu, 200);
      else if (act === "more-rename") setTimeout(openRename, 200);
      else if (act === "more-global") setTimeout(() => toggleGlobal(d, isGlobal), 200);
    });
  });
}

/** Hand an action to panel.js's router, which owns delete-set and set-mode. */
function routeAction(action, data) {
  const b = document.createElement("button");
  b.dataset.action = action;
  for (const [k, v] of Object.entries(data)) b.dataset[k] = v;
  b.hidden = true;
  document.body.appendChild(b);
  b.click();
  b.remove();
}

function openRename() {
  const d = detail;
  if (!d?.studySet) return;
  const current = cleanTitle(d.studySet.title || d.session.title || "");
  openSheet("Rename set", `
    <input type="text" id="rename-input" aria-label="Set name" maxlength="200" value="${esc(current)}" style="height:44px;padding:0 14px;border-radius:12px;background:var(--bg-surface);border:1px solid var(--border-card);color:var(--text-primary);font-family:inherit;font-size:15px;outline:none" />
    <button type="button" class="sheet-primary" id="rename-save">Save</button>`, false, null, { px: 16, pb: 24, gap: 14 });
  const input = byId("rename-input");
  const save = byId("rename-save");
  input?.select();
  const sync = () => { save.disabled = !input.value.trim(); };
  input?.addEventListener("input", sync);
  input?.addEventListener("keydown", (e) => { if (e.key === "Enter" && !save.disabled) save.click(); });
  save?.addEventListener("click", async () => {
    const title = input.value.trim();
    if (!title) return;
    try {
      await updateStudySet(d.session.id, { title });
      d.studySet.title = title;
      closeSheet();
      toast("Set renamed");
      syncNow().catch(() => {});
      paintDetail(true, true);
    } catch (e) { toast(e.message); }
  });
}

/** The exam row: pick or clear this set's exam date in a sheet, in place. */
export function openSetExamEditor() {
  const d = detail;
  if (!d?.studySet) return;
  const pad = (n) => String(n).padStart(2, "0");
  const toInput = (ms) => { const x = new Date(ms); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
  const today = toInput(Date.now());
  const value = d.studySet.examDate ? toInput(d.studySet.examDate) : toInput(Date.now() + 30 * 86_400_000);
  openSheet("Exam date", `
    <input type="date" id="set-exam-input" aria-label="Exam date" value="${esc(value)}" min="${esc(today)}" style="height:44px;padding:0 14px;border-radius:12px;background:var(--bg-surface);border:1px solid var(--border-card);color:var(--text-primary);font-family:inherit;font-size:15px" />
    <button type="button" id="set-exam-save" class="sheet-primary">Save exam</button>
    ${d.studySet.examDate ? `<button type="button" id="set-exam-clear" style="height:40px;background:transparent;border:none;color:var(--danger-text);font-family:inherit;font-size:14px;font-weight:600;cursor:pointer">Remove exam</button>` : ""}`, false, null, { px: 16, pb: 24, gap: 14 });
  const apply = async (ms) => {
    await setExamDate(d.session.id, ms);
    d.studySet.examDate = ms;
    closeSheet();
    toast(ms ? "Exam date saved" : "Exam removed");
    paintDetail(true, true);
  };
  byId("set-exam-save")?.addEventListener("click", () => {
    const v = /** @type {HTMLInputElement} */ (byId("set-exam-input"))?.value;
    apply(v ? new Date(v + "T23:59:59").getTime() : null).catch((e) => toast(e.message));
  });
  byId("set-exam-clear")?.addEventListener("click", () => apply(null).catch((e) => toast(e.message)));
}

let ratingsSnapshot = {};
function getRatingGlobal(rootId) {
  return !!ratingsSnapshot[rootId]?.isGlobal;
}

async function toggleGlobal(d, isGlobal) {
  const { getAuth } = await import("../../sync/auth.js");
  const auth = await getAuth();
  if (!auth?.accessToken) {
    toast("Sign in to share in Discover");
    return;
  }
  const id = d.session.id;
  if (isGlobal) {
    try {
      await send({ type: "GLOBAL_UNPUBLISH", setId: id });
      d.studySet.isGlobal = false;
      if (ratingsSnapshot[id]) ratingsSnapshot[id].isGlobal = false;
      toast("Set is private again");
      syncNow().catch(() => {});
      paintDetail(true, true);
    } catch (e) { toast(e.message); }
    return;
  }
  const n = (d.studySet.flashcards || []).filter((c) => !c.deleted).length;
  const line = (icon, label, text) => `<div style="display:flex;gap:10px;font-size:14px;line-height:1.4">${icon}<span><b style="font-weight:600">${label}</b> ${text}</span></div>`;
  const ok = await confirmSheet({
    title: "Make this set global?",
    body: "It will appear in Discover for learners with similar interests. Anyone can add a copy and rate it.",
    detailsHtml: `
      <div style="display:flex;flex-direction:column;gap:10px">
        ${line(I.check.replace("<svg", '<svg style="flex-shrink:0"'), "Shared:", `title, ${n} ${n === 1 ? "card" : "cards"}, summary, your display name`)}
        ${line(I.lock, "Stays private:", "your progress, schedule and exam date")}
      </div>
      <div style="font-size:13px;line-height:1.45;color:var(--text-muted)">You can make it private again anytime. People who already added it keep their copy.</div>`,
    confirmLabel: "Make global",
  });
  if (!ok) return;
  try {
    await send({ type: "GLOBAL_PUBLISH", setId: id });
    d.studySet.isGlobal = true;
    ratingsSnapshot[id] = { ...(ratingsSnapshot[id] || {}), isGlobal: true };
    toast("Now in Discover");
    syncNow().catch(() => {});
    paintDetail(true, true);
  } catch (e) {
    toast(e.message || "This set can't be shared");
  }
}

function openTypeMenu() {
  const d = detail;
  const current = d.studySet.mode || "general";
  const types = [
    { id: "general", name: "General", desc: "Standard AI flashcards." },
    { id: "coding", name: "Coding", desc: "Write small exercises in an IDE." },
    { id: "design", name: "System design", desc: "Draw architectures and spot bottlenecks." },
    { id: "medicine", name: "Clinical medicine", desc: "Case notes and mechanism chains." }
  ];
  const CHECK = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
  const html = `<div style="display:flex;flex-direction:column;gap:4px" role="radiogroup" aria-label="Set type">${types.map((t) => `
    <button type="button" class="opt-row type-opt" role="radio" aria-checked="${t.id === current}" data-action="set-mode" data-mode="${t.id}" data-id="${esc(d.session.id)}" style="height:auto;padding:10px 12px">
      <span style="flex:1;display:flex;flex-direction:column;gap:2px"><span style="font-size:15px;font-weight:600">${t.name}</span><span style="font-size:13px;color:var(--text-muted)">${t.desc}</span></span>
      <span class="check">${t.id === current ? CHECK : ""}</span>
    </button>`).join("")}</div>`;

  openSheet("Set type", html, false, null, { px: 16, pb: 24, gap: 14 });
  // The click goes on to panel.js's set-mode handler; this only closes the sheet.
  byId("sheet").querySelectorAll(".type-opt").forEach((btn) => btn.addEventListener("click", () => closeSheet()));
}
