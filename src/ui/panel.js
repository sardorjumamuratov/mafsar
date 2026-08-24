import {
  getSettings,
  getSessions,
  addSession,
  deleteSession,
  getStudySets,
  saveStudySet,
  updateCard,
  addCard,
  deleteCard,
  setExamDate,
  getActivity,
  bumpActivity,
  computeStreak,
  weekActivity,
  dayKey,
  uid,
  getReviewLog,
  appendReviewLog,
  exportAll,
  importAll,
} from "../storage/store.js";
import { LANDING_BASE } from "../config.js";
import { initSchedule, review, isDue, byDue, masteryOf } from "../storage/srs.js";
import { examReadiness, nextExam, weakTopics } from "../storage/readiness.js";
import { quizLengths } from "./quiz-lengths.js";
import { shareLinkFor, teamLinkFor, parseShareCode, parseTeamCode } from "./share-link.js";
import { codeSize, MAX_CODE_CHARS } from "../storage/coding.js";
import { getAuth, register, login, logout } from "../sync/auth.js";
import { syncNow } from "../sync/sync.js";

const app = document.getElementById("app");
const nav = document.getElementById("bottomNav");

// ---------------------------------------------------------------- helpers
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// --- the one place HTML enters the DOM ---------------------------------------
// Every dynamic value interpolated into the render templates below is escaped
// with esc() at the call site. This is the single sink that turns those strings
// into nodes, so there's exactly one spot to audit.
//
// DOMParser builds a detached, inert document: scripts never execute and no
// images/iframes are fetched during parsing. The nodes are then adopted into a
// fragment the callers insert. (Assigning to a live element's DOM-HTML would
// be equally inert for scripts but is flagged by addons-linter, which can't
// see the escaping above.)
function fragment(html) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const frag = document.createDocumentFragment();
  frag.append(...parsed.body.childNodes);
  return frag;
}
/** Replace an element's children with parsed HTML (was: el.DOM-HTML = …). */
function setHTML(el, html) {
  el.replaceChildren(fragment(html));
}
/**
 * New *view* renders call this to start at the title — #app keeps its scroll
 * offset across setHTML. In-place repaints (grading, flipping, editing a card)
 * must NOT call it: the user's position is part of that interaction.
 */
function topOfView() {
  app.scrollTop = 0;
}
/** Replace the element itself with parsed HTML (was: el.DOM-OUTER = …). */
function replaceHTML(el, html) {
  el.replaceWith(fragment(html));
}
/** Insert parsed HTML immediately before an element. */
function insertHTMLBefore(el, html) {
  el.parentNode.insertBefore(fragment(html), el);
}

const FLAME =
  '<svg viewBox="0 0 24 24"><path d="M13 2c.5 3.5-2.5 4.8-2.5 8A2.5 2.5 0 0 0 15 10c0-1-.3-1.8-.7-2.6 2.4 1.2 4.2 3.6 4.2 6.6a6.5 6.5 0 1 1-13 0c0-4.7 4-6.4 7.5-12z"/></svg>';
const XBTN =
  '<button class="iconbtn" data-action="close-focus" aria-label="Close"><svg class="ic" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
const COPY_SVG =
  '<svg class="ic" viewBox="0 0 24 24"><path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1M8 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M8 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m0 0h2m-2 4h4m-4 4h4"/></svg>';

function toast(msg, ms = 2600) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add("hidden"), ms);
}

function send(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (resp) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!resp || !resp.ok) return reject(new Error(resp?.error || "Request failed"));
      resolve(resp);
    });
  });
}
function queryActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs && tabs[0]));
  });
}
function sendToTab(tabId, msg) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, msg, (resp) => {
      resolve(chrome.runtime.lastError ? null : resp);
    });
  });
}

function timeUntil(ts) {
  const s = Math.floor((ts - Date.now()) / 1000);
  if (s <= 0) return "now";
  const h = Math.floor(s / 3600);
  if (h < 1) return "soon";
  if (h < 24) return `in ${h}h`;
  return `in ${Math.round(h / 24)}d`;
}
function examDaysLeft(examDate) {
  const d = Math.ceil((examDate - Date.now()) / 86400000);
  if (d < 0) return "Exam passed";
  if (d === 0) return "Today's the day";
  return `${d} day${d === 1 ? "" : "s"} to go`;
}
function dateInputValue(examDate) {
  // yyyy-mm-dd for <input type="date">, local time.
  if (!examDate) return "";
  const d = new Date(examDate);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
function sourceLabel(session) {
  return (
    session.sourceLabel ||
    { chatgpt: "ChatGPT", claude: "Claude", gemini: "Gemini", quizlet: "Quizlet", shared: "Shared" }[session.source] ||
    "Chat"
  );
}

// ---------------------------------------------------------------- data
async function bundle() {
  const [sessions, studySets, activity, settings, reviewLog] = await Promise.all([
    getSessions(),
    getStudySets(),
    getActivity(),
    getSettings(),
    getReviewLog(),
  ]);
  return { sessions, studySets, activity, settings, reviewLog };
}
const setFor = (sessionId, studySets) => studySets.find((s) => s.sessionId === sessionId) || null;

function summarize(studySet) {
  const cards = studySet?.flashcards || [];
  const total = cards.length;
  let mastered = 0,
    learning = 0,
    fresh = 0,
    due = 0;
  for (const c of cards) {
    const m = masteryOf(c);
    if (m === "mastered") mastered++;
    else if (m === "learning") learning++;
    else fresh++;
    if (isDue(c)) due++;
  }
  return { total, mastered, learning, fresh, due, progress: total ? Math.round((mastered / total) * 100) : 0 };
}

// ---------------------------------------------------------------- chrome (nav)
let activeTab = "home";
function showChrome(visible) {
  nav.classList.toggle("hidden", !visible);
}
function setNav(tab) {
  activeTab = tab;
  nav.querySelectorAll("button[data-nav]").forEach((b) => b.classList.toggle("on", b.dataset.nav === tab));
}
/** Back-button target for focus views (set detail, exam picker, import): return to whichever bottom-nav tab was active before entering. */
function goToActiveTab() {
  ({ home: renderHome, sets: renderSets, teams: renderTeams, you: renderYou }[activeTab] || renderHome)();
}

// ================================================================ HOME
async function renderHome() {
  setNav("home");
  showChrome(true);
  const { sessions, studySets, activity, settings, reviewLog } = await bundle();

  let due = 0,
    mastered = 0,
    total = 0;
  for (const set of studySets) {
    const s = summarize(set);
    due += s.due;
    mastered += s.mastered;
    total += s.total;
  }
  const progress = total ? Math.round((mastered / total) * 100) : 0;
  const reviewedToday = activity[dayKey()] || 0;
  const streak = computeStreak(activity);
  const week = weekActivity(activity);
  const est = Math.max(1, Math.round(due * 0.4));

  const withSets = sessions.filter((s) => setFor(s.id, studySets));
  const topSets = withSets.slice(0, 4);

  // --- Exam section: one date on Home, applied to the sets the user picks ---
  const examSets = studySets.filter((s) => s.examDate && s.examDate > Date.now());
  const examDate = examSets.length ? Math.min(...examSets.map((s) => s.examDate)) : null;
  let totals = { total: 0, mastered: 0, due: 0 };
  for (const s of examSets) {
    const x = summarize(s);
    totals.total += x.total;
    totals.mastered += x.mastered;
    totals.due += x.due;
  }
  const exam = examDate
    ? examReadiness({ examDate, total: totals.total, mastered: totals.mastered, due: totals.due })
    : null;
  const behind = exam?.status === "behind" || exam?.status === "today";
  // The date input gets its own labeled row rather than competing with the
  // heading in a flex row — a native date field can't be shrunk gracefully.
  const examCard = exam
    ? `<div class="block exam-live">
         <div class="exam-head">
           <span class="exam-ic">🎯</span>
           <div class="exam-head-txt">
             <div class="t-label">${examDaysLeft(examDate)}</div>
             <div class="sub">${totals.total} card${totals.total === 1 ? "" : "s"} · ${examSets.length} set${examSets.length === 1 ? "" : "s"}</div>
           </div>
           <span class="pill ${behind ? "warn" : "ok"}">${behind ? "Behind" : "On track"}</span>
         </div>
         <div class="bar ${exam.progress === 100 ? "ok" : ""}"><i style="width:${totals.total ? exam.progress : 0}%"></i></div>
         <div class="prog-line" style="font-size:12px">
           <span style="font-weight:600;color:var(--ink)">${exam.progress}% mastered</span>
           <span>${exam.dailyTarget}/day to finish</span>
         </div>
         <label class="date-field">
           <span>Exam date</span>
           <input type="date" id="homeExamDate" class="date-input" value="${dateInputValue(examDate)}" />
         </label>
         <div class="exam-actions">
           <button class="btn btn-ghost btn-sm" data-action="exam-pick">Choose sets</button>
           <button class="btn btn-ghost btn-sm" data-action="exam-clear">Clear</button>
         </div>
       </div>`
    : `<div class="block exam-live">
         <div class="exam-head" data-action="exam-pick" role="button" tabindex="0">
           <span class="exam-ic">🎯</span>
           <div class="exam-head-txt">
             <div class="t-label">Exam prep</div>
             <div class="sub">Set a date and pick which sets count</div>
           </div>
           <svg class="ic chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
         </div>
         <label class="date-field">
           <span>Exam date</span>
           <input type="date" id="homeExamDate" class="date-input" value="" />
         </label>
       </div>`;

  const allCards = studySets.flatMap((s) => s.flashcards || []);
  const weak = weakTopics(reviewLog, allCards);
  const insightsCard = weak.length
    ? `<div class="listhd"><span class="t-label">Needs work</span></div>
       <div class="block insight" style="display:flex;flex-direction:column;gap:9px">
         ${weak
           .slice(0, 3)
           .map(
             (w) =>
               `<div class="insight-row"><span class="q">${esc(w.front)}</span>${
                 w.forgetRisk
                   ? `<span class="tag dot" style="color:var(--warm)">forget soon</span>`
                   : `<span class="tag">${w.fails} miss${w.fails === 1 ? "" : "es"}</span>`
               }</div>`
           )
           .join("")}
       </div>`
    : "";

  const heroHtml = due
    ? `<div class="due-hero">
         <div><div class="t-label">Due today</div><div class="n tnum">${due}</div>
         <div class="sub">across ${withSets.length} set${withSets.length === 1 ? "" : "s"} · ~${est} min</div></div>
         <button class="btn btn-primary btn-block" data-action="start-review">Start review</button>
       </div>`
    : `<div class="block tint" style="text-align:center">
         <div style="font-size:26px">✅</div>
         <div style="font-weight:650;margin-top:6px">You're all caught up</div>
         <div style="font-size:12.5px;color:var(--muted);margin-top:4px">No cards due right now. Capture a chat or import a set.</div>
       </div>`;

  setHTML(app, `
    <div class="view">
      <div class="ahd">
        <div><div class="h-sub">${greeting()}</div><div class="h-title">Ready to review</div></div>
        <div style="display:flex;gap:8px;align-items:center">
          <span class="streak">${FLAME}${streak}</span>
                  </div>
      </div>

      ${heroHtml}
      ${examCard}

      <div class="block" style="display:flex;flex-direction:column;gap:11px">
        <div class="listhd"><span class="t-label">This week</span>
          <span class="tag">${week.filter((d) => d.count).length} of 7 days</span></div>
        <div class="week">
          ${week
            .map(
              (d) =>
                `<div class="d"><span class="dot ${d.isToday ? "today" : d.count ? "on" : ""}"></span><span class="lbl">${d.label}</span></div>`
            )
            .join("")}
        </div>
      </div>

      <div class="stats">
        <div class="stat"><div class="v tnum">${mastered}</div><div class="k">Mastered</div></div>
        <div class="stat"><div class="v tnum">${progress}%</div><div class="k">Progress</div></div>
        <div class="stat"><div class="v tnum">${studySets.length}</div><div class="k">Sets</div></div>
      </div>

      ${insightsCard}

      <div class="listhd"><span class="t-label">Your sets</span>
        <button class="linkbtn" data-action="open-import">＋ Import</button></div>
      ${
        topSets.length
          ? topSets.map((s) => setRow(s, summarize(setFor(s.id, studySets)))).join("")
          : `<div class="empty">No study sets yet.<br>Open ChatGPT, Claude, or Gemini and click <b>Save to Mafsar</b>.</div>`
      }
      ${withSets.length > 4 ? `<button class="btn btn-ghost btn-block" data-action="nav-sets">View all ${withSets.length} sets</button>` : ""}
      ${reviewedToday ? `<div style="text-align:center;font-size:12px;color:var(--faint)">${reviewedToday} cards reviewed today</div>` : ""}
    </div>`);
  topOfView();
}

// --- Exam set picker (focus view): choose which sets count toward the exam ---
let examDraft = null; // { date: ms|null, picked: Set<sessionId> }

async function openExamPicker() {
  const { sessions, studySets } = await bundle();
  const withSets = sessions.filter((s) => setFor(s.id, studySets));
  const examSets = studySets.filter((s) => s.examDate && s.examDate > Date.now());
  examDraft = {
    date: examSets.length ? Math.min(...examSets.map((s) => s.examDate)) : examDraft?.date || null,
    picked: new Set(examSets.map((s) => s.sessionId)),
  };
  showChrome(false);
  setHTML(app, `
    <div class="view">
      <div class="ahd">
        <button class="iconbtn" data-action="nav-back" aria-label="Back"><svg class="ic" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>
        <div class="h-title" style="font-size:16px">Exam sets</div><span style="width:32px"></span>
      </div>
      <div class="field"><label>Exam date</label>
        <input type="date" id="pickerDate" class="date-input" value="${dateInputValue(examDraft.date)}" style="width:auto" /></div>
      <div class="help" style="margin:0">Pick the sets this exam covers. Selected sets resurface cards before the date and count toward readiness.</div>
      <div class="block" style="padding:6px 14px">
        ${
          withSets.length
            ? withSets
                .map((session) => {
                  const set = setFor(session.id, studySets);
                  const s = summarize(set);
                  return `<label class="pick-row">
                    <input type="checkbox" class="picker-check" data-id="${esc(session.id)}" ${examDraft.picked.has(session.id) ? "checked" : ""} />
                    <span style="flex:1;min-width:0">
                      <span class="name">${esc(session.title || "Untitled")}</span>
                      <span class="blurb" id="blurb-${esc(session.id)}">${esc(set?.blurb || `${s.total} cards`)}</span>
                    </span>
                    <span class="tag">${s.total}</span>
                  </label>`;
                })
                .join("")
            : `<div class="empty">No sets yet — capture or import something first.</div>`
        }
      </div>
      <button class="btn btn-primary btn-block" data-action="picker-save" ${withSets.length ? "" : "disabled"}>Save exam</button>
    </div>`);
  topOfView();
  fillMissingBlurbs(withSets, studySets);
}

/** Fetch tiny AI blurbs for sets that don't have one; patch rows as they land. */
async function fillMissingBlurbs(sessions, studySets) {
  for (const session of sessions) {
    const set = setFor(session.id, studySets);
    if (!set || set.blurb || !set.flashcards?.length) continue;
    const cell = document.getElementById(`blurb-${session.id}`);
    if (!cell) continue;
    try {
      const r = await send({ type: "GET_BLURB", sessionId: session.id });
      if (r.blurb && document.getElementById(`blurb-${session.id}`)) {
        document.getElementById(`blurb-${session.id}`).textContent = r.blurb;
      }
    } catch {
      /* offline or LLM error — the card count stays as the label */
    }
  }
}

async function saveExamSelection() {
  const dateStr = document.getElementById("pickerDate")?.value;
  const date = dateStr ? new Date(`${dateStr}T23:59:59`).getTime() : null;
  if (!date) return toast("Pick an exam date first.");
  const { studySets } = await bundle();
  for (const set of studySets) {
    const picked = examDraft?.picked.has(set.sessionId);
    if (picked && set.examDate !== date) await setExamDate(set.sessionId, date);
    if (!picked && set.examDate) await setExamDate(set.sessionId, null);
  }
  toast("Exam date set. Cards will resurface before it.");
  renderHome();
}

// --- Sharing: the share link lives at the top of every set detail ----------
// The code is cached on the set (local-only); the link is ${LANDING_BASE}/s/{code}.
let shareOpenFor = null; // sessionId whose share block is revealed (survives tab switches)

/**
 * Read-only value + copy icon button, shared by the per-set share link and the
 * team link/code fields. Tapping the field selects+copies too (select-all).
 */
function copyRowHtml(label, value, hint = "", valueCls = "") {
  return `<div class="field">
    <label>${label}${hint ? ` <span style="font-weight:normal;color:var(--muted)">— ${hint}</span>` : ""}</label>
    <div style="display:flex;gap:8px">
      <input type="text" readonly value="${esc(value)}" class="share-readonly ${valueCls}" data-action="select-all" style="flex:1" />
      <button class="btn btn-ghost btn-sm copy-btn" data-action="share-copy" data-code="${esc(value)}" aria-label="Copy ${esc(label.toLowerCase())}">
        ${COPY_SVG}<span class="lbl">Copy</span>
      </button>
    </div>
  </div>`;
}

/** Set-detail share reveal: link + code + revoke, once a code exists. */
function shareBlockHtml(studySet) {
  const code = studySet?.shareCode;
  if (!code) return "";
  return `<div class="block" style="display:flex;flex-direction:column;gap:12px">
    ${copyRowHtml("Link", shareLinkFor(code, LANDING_BASE), "anyone with it can add a copy")}
    ${copyRowHtml("Code", code, "entered under Sets → Add a shared set", "share-code tnum")}
    <div>
      <button class="linkbtn" style="align-self:flex-start" data-action="share-revoke" data-id="${esc(studySet.sessionId)}">Stop sharing</button>
      <div style="font-size:12px;color:var(--muted);margin-top:2px">Both link and code will stop working. Copies already added are kept.</div>
    </div>
  </div>`;
}

/** Make sure the set has a share code, creating (and caching) one if needed. */
async function ensureShareFor(sessionId) {
  const { studySets } = await bundle();
  const set = setFor(sessionId, studySets);
  if (!set) return null;
  if (set.shareCode) return set;
  toast("Creating link…");
  try {
    const r = await send({ type: "SHARE_CREATE", setId: sessionId });
    set.shareCode = r.code;
    await saveStudySet(set);
    return set;
  } catch (e) {
    toast(e.message || "Couldn't create a share link.");
    return null;
  }
}

/** Header "Share link" button: reveal (creating the code if needed) or hide. */
async function toggleSetShare(sessionId) {
  if (shareOpenFor === sessionId) {
    shareOpenFor = null;
    return paintDetail();
  }
  const set = await ensureShareFor(sessionId);
  if (!set) return;
  shareOpenFor = sessionId;
  paintDetail();
}

async function copyShareCode(code, btn = null) {
  try {
    await navigator.clipboard.writeText(code);
    toast("Copied to clipboard");
    if (btn) {
      const children = [...btn.childNodes];
      setHTML(btn, `<span class="lbl">✓ Copied</span>`);
      btn.setAttribute("aria-live", "polite");
      setTimeout(() => {
        btn.replaceChildren(...children);
        btn.removeAttribute("aria-live");
      }, 1500);
    }
  } catch {
    toast("Copy failed — the text stays selected in the field");
  }
}

async function revokeShareFor(sessionId) {
  const { studySets } = await bundle();
  const set = setFor(sessionId, studySets);
  if (!set?.shareCode) return;
  if (!confirm("Stop sharing this set? People who already added it keep their copy; the code stops working.")) return;
  try {
    await send({ type: "SHARE_REVOKE", code: set.shareCode });
    delete set.shareCode;
    await saveStudySet(set);
    shareOpenFor = null;
    paintDetail();
    toast("Sharing stopped");
  } catch (e) {
    toast(e.message);
  }
}

function setRow(session, s) {
  const dueTag = s.due
    ? `<span class="tag dot" style="color:var(--warm)">${s.due} due</span>`
    : s.progress === 100 && s.total
    ? `<span class="tag">Mastered</span>`
    : `<span class="tag">0 due</span>`;
  return `
    <div class="setrow" data-action="open-set" data-id="${esc(session.id)}">
      <div class="top"><div class="name">${esc(session.title || "Untitled")}</div>${dueTag}</div>
      <div class="bar ${s.progress === 100 && s.total ? "ok" : ""}"><i style="width:${s.total ? s.progress : 0}%"></i></div>
      <div class="prog-line"><span>${s.total ? s.progress + "% mastered" : "Not generated"}</span><span>${esc(sourceLabel(session))}</span></div>
    </div>`;
}

// ================================================================ SETS
async function renderSets() {
  setNav("sets");
  showChrome(true);
  const { sessions, studySets } = await bundle();
  setHTML(app, `
    <div class="view">
      <div class="ahd"><div class="h-title">Your sets</div>
        <button class="btn btn-ghost" style="padding:8px 12px" data-action="open-import">⇪ Import</button></div>
      ${
        sessions.length
          ? sessions.map((s) => setRow(s, summarize(setFor(s.id, studySets)))).join("")
          : `<div class="empty"><div class="big">📚</div>No sets yet.<br>Capture an AI conversation with <b>Save to Mafsar</b>, or import from Quizlet.</div>`
      }
      <div class="listhd" style="margin-top:16px"><span class="t-label">Add a shared set</span></div>
      <div class="help" style="margin:0">Have a code or link from another Mafsar user? Enter it to add a copy of their cards to your sets. Your progress is your own — nothing syncs back.</div>
      <div class="field"><label>Share code or link</label>
        <input id="shareCode" type="text" placeholder="e.g. 7KX2M9QRTA or mafsar.../s/..." autocomplete="off" autocapitalize="off" /></div>
      <button class="btn btn-primary btn-block" data-action="share-lookup">Look up set</button>
      <div id="sharePreview"></div>
      <button class="btn btn-ghost btn-block" data-action="capture-current">＋ Capture this page</button>
    </div>`);
  topOfView();
}

// ================================================================ SET DETAIL
let detail = null; // { session, studySet, summary, tab }
let editingCardId = null;

async function renderSetDetail(sessionId, tab = "cards") {
  showChrome(true);
  const { sessions, studySets } = await bundle();
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) return renderHome();
  const studySet = setFor(sessionId, studySets);
  detail = { session, studySet, tab };
  paintDetail();
  topOfView(); // new view (also covers tab switches); paintDetail repaints must not reset
}

function paintDetail() {
  const { session, studySet, tab } = detail;
  const s = summarize(studySet);

  let body = "";
  if (!studySet) {
    body = `<div class="empty">
        <div class="big">✨</div>Flashcards are usually generated automatically when you save a chat.
        <div style="font-size:12.5px;color:var(--muted);margin-top:4px">If generation failed (offline, or you weren't signed in yet), try again:</div>
        <div style="margin-top:14px"><button class="btn btn-primary" data-action="make-set" data-id="${esc(session.id)}">Retry generation</button></div>
      </div>`;
  } else if (tab === "cards") {
    const exam = studySet.examDate
      ? examReadiness({ examDate: studySet.examDate, total: s.total, mastered: s.mastered, due: s.due })
      : null;
    const statusLabel = { "on-track": "On track", behind: "Behind", today: "Exam today", past: "Exam passed" }[exam?.status];
    const statusColor = exam?.status === "behind" || exam?.status === "today" ? "var(--warm)" : "var(--success)";

    // Exam dates are set on Home now (applied to picked sets); the set detail
    // only shows this set's readiness. Per-set input kept here for reference:
    // <input type="date" id="examDate" value="…" data-session="…" /> + Clear btn
    const examPanel = `
      ${
        exam
          ? `<div class="block exam-live">
               <div class="exam-head">
                 <span class="exam-ic">🎯</span>
                 <div class="exam-head-txt">
                   <div class="t-label">${exam.daysLeft < 0 ? "Exam passed" : exam.daysLeft === 0 ? "Exam today" : `${exam.daysLeft} day${exam.daysLeft === 1 ? "" : "s"} to go`}</div>
                   <div class="sub">${s.total} card${s.total === 1 ? "" : "s"} in this set</div>
                 </div>
                 <span class="pill ${statusColor === "var(--warm)" ? "warn" : "ok"}"
                       title="On track = the daily pace below is sustainable (20 cards/day or fewer). Behind = it isn't, or the exam is within 2 days with most of the set unmastered.">${statusLabel}</span>
               </div>
               <div class="bar ${s.progress === 100 ? "ok" : ""}"><i style="width:${s.progress}%"></i></div>
               <div class="readiness">
                 <div class="r-cell" title="Share of this set's cards you've mastered."><div class="v tnum">${s.progress}%</div><div class="k">mastered</div></div>
                 <div class="r-cell" title="Cards left to master ÷ days left."><div class="v tnum">${exam.status === "past" ? "—" : exam.dailyTarget}</div><div class="k">cards/day</div></div>
                 <div class="r-cell" title="Cards scheduled for review right now."><div class="v tnum">${s.due}</div><div class="k">due now</div></div>
               </div>
             </div>`
          : `<div class="help" style="margin:0">Set an exam date on Home and pick this set to get a countdown, daily target, and pre-exam resurfacing.</div>`
      }`;

    const editForm = editingCardId
      ? `<div class="block editcard">
           <div class="field"><label>Front</label><textarea id="editFront" rows="2">${esc(studySet.flashcards.find((c) => c.id === editingCardId)?.front || "")}</textarea></div>
           <div class="field"><label>Back</label><textarea id="editBack" rows="3">${esc(studySet.flashcards.find((c) => c.id === editingCardId)?.back || "")}</textarea></div>
           <div style="display:flex;gap:10px">
             <button class="btn btn-ghost" style="flex:1" data-action="edit-cancel">Cancel</button>
             <button class="btn btn-primary" style="flex:1" data-action="edit-save" data-id="${esc(editingCardId)}">Save card</button>
           </div>
         </div>`
      : "";

    body = `
      ${examPanel}
      <div class="mastery">
        <div class="m new"><div class="v tnum">${s.fresh}</div><div class="k">New</div></div>
        <div class="m learn"><div class="v tnum">${s.learning}</div><div class="k">Learning</div></div>
        <div class="m mast"><div class="v tnum">${s.mastered}</div><div class="k">Mastered</div></div>
      </div>
      <div class="help" style="margin:0">New → <b>Learning</b> after one correct review → <b>Mastered</b> once it is on a 6+ day interval (about a week of good grades). <i>Again</i> brings a card back later in this session and resets its schedule.</div>
      ${editForm}
      <div class="block" style="padding:6px 14px">
        ${
          studySet.flashcards.length
            ? studySet.flashcards
                .map(
                  (c) =>
                    `<div class="cardrow"><span class="sdot ${masteryOf(c)}"></span><span class="q">${esc(c.front)}</span><span class="due">${
                      isDue(c) ? "Due now" : timeUntil(c.dueDate)
                    }</span>
                     <span class="rowbtns">
                       <button class="iconbtn ic-xs" data-action="card-edit" data-id="${esc(c.id)}" aria-label="Edit"><svg class="ic" viewBox="0 0 24 24"><path d="M4 20l4-1L20 7l-3-3L5 16l-1 4z"/></svg></button>
                       <button class="iconbtn ic-xs" data-action="card-del" data-id="${esc(c.id)}" aria-label="Delete"><svg class="ic" viewBox="0 0 24 24"><path d="M5 7h14M9 7V5h6v2m-8 0l1 13h8l1-13"/></svg></button>
                     </span></div>`
                )
                .join("")
            : '<div class="empty">No flashcards.</div>'
        }
      </div>
      ${studySet.mode === "coding" ? `<button class="btn btn-ghost btn-block" data-action="start-coding" data-id="${esc(session.id)}">⌨️ Coding exercises</button>` : ""}
      <div style="display:flex;gap:10px">
        <button class="btn btn-ghost" style="flex:1" data-action="add-card" data-id="${esc(session.id)}">＋ Card</button>
        <button class="btn btn-ghost" style="flex:1" data-action="start-typed" data-id="${esc(session.id)}">✍️ Type answers</button>
      </div>
      <!-- Export paused while import-from-Anki/Quizlet ships:
      <button class="btn btn-ghost btn-block" data-action="export-tsv" data-id="${esc(session.id)}">⇩ Export to Anki/CSV</button> -->`;
  } else if (tab === "quiz") {
    const available = studySet.quiz?.length || 0;
    // Quick is a fixed 5, Half is half the set rounded to the nearest 5,
    // Full is everything — capped by stored questions. See quiz-lengths.js.
    const lengths = quizLengths(s.total, available);

    body = available
      ? `<div class="block" style="text-align:center">
           <div style="font-weight:650">Multiple-choice quiz</div>
           <div style="font-size:12.5px;color:var(--muted);margin:6px 0 14px">Questions and options are shuffled every sitting.</div>
           ${
             lengths.length > 1
               ? `<div class="qlens" role="group" aria-label="Quiz length">
                    ${lengths
                      .map(
                        ([label, n], i) =>
                          `<button class="qlen${i === 0 ? " on" : ""}" data-action="quiz-len" data-n="${n}" aria-pressed="${i === 0}">
                             <span class="l">${label}</span><span class="n tnum">${n} question${n === 1 ? "" : "s"}</span>
                           </button>`
                      )
                      .join("")}
                  </div>`
               : ""
           }
           <button class="btn btn-primary btn-block" data-action="start-quiz" data-n="${lengths[0][1]}">Start quiz</button>
         </div>`
      : `<div class="empty">No quiz for this set.<br>${
          session.source === "quizlet"
            ? "Imported sets are flashcards only."
            : "Tap <b>↻ Regenerate</b> (top right) — fresh sets scale the quiz with the cards."
        }</div>`;
  } else {
    // summary
    const summ = studySet.summary;
    body = `
      <div class="block" style="display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <span class="tag dot" style="color:var(--primary)">${esc(sourceLabel(session))}</span>
          <span class="tag">${studySet.flashcards.length} cards</span>
          ${session.messages?.length ? `<span class="tag">${session.messages.length} messages</span>` : ""}
        </div>
        ${
          summ
            ? `<div class="t-label" style="margin-top:6px">TL;DR</div>
               <div style="font-size:13px;line-height:1.6;color:var(--ink)">${esc(summ.summary)}</div>
               ${summ.keyPoints?.length ? `<div class="t-label" style="margin-top:10px">Key points</div>
               <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.6;color:var(--muted)">
                 ${summ.keyPoints.map((p) => `<li>${esc(p)}</li>`).join("")}
               </ul>` : ""}`
            : session.messages?.length
            ? `<div class="help" style="margin:0">Get an AI TL;DR and key takeaways from this conversation.</div>
               <button class="btn btn-primary btn-block" data-action="gen-summary" data-id="${esc(session.id)}">✨ Summarize conversation</button>`
            : `<div class="t-label" style="margin-top:6px">Key points</div>
               <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.6;color:var(--muted)">
                 ${(studySet.flashcards || []).slice(0, 8).map((c) => `<li>${esc(c.front)}</li>`).join("") || "<li>No cards</li>"}
               </ul>`
        }
      </div>
      <div class="block" style="display:flex;flex-direction:column;gap:9px">
        <div class="t-label">Study mode</div>
        <div class="modes" role="group" aria-label="Study mode">
          ${[
            ["general", "General", "Flashcards, quiz, written answers"],
            ["coding", "Coding", "Review swaps in small coding tasks"],
          ]
            .map(
              ([id, label, hint]) =>
                `<button class="modebtn${(studySet.mode || "general") === id ? " on" : ""}"
                   data-action="set-mode" data-id="${esc(session.id)}" data-mode="${id}"
                   aria-pressed="${(studySet.mode || "general") === id}">
                   <span class="l">${label}</span><span class="h">${hint}</span>
                 </button>`
            )
            .join("")}
        </div>
      </div>

`;
  }

  setHTML(app, `
    <div class="view">
      <div class="ahd">
        <button class="iconbtn" data-action="nav-back" aria-label="Back"><svg class="ic" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>
        <span style="flex:1"></span>
        ${
          studySet
            ? `<button class="btn btn-ghost btn-sm" data-action="set-share" data-id="${esc(session.id)}"
                 aria-expanded="${shareOpenFor === session.id}" aria-controls="shareOut">🔗 Share link</button>`
            : ""
        }
        ${
          studySet
            ? `<button class="linkbtn" data-action="make-set" data-id="${esc(session.id)}" title="Regenerate flashcards and quiz from the source — matching cards keep their review schedule">↻ Regenerate</button>`
            : `<span class="tag">${s.total} cards</span>`
        }
        ${studySet ? `<button class="iconbtn" data-action="delete-set" data-id="${esc(session.id)}" aria-label="Delete set"><svg class="ic" viewBox="0 0 24 24"><path d="M5 7h14M9 7V5h6v2m-8 0l1 13h8l1-13"/></svg></button>` : ""}
      </div>
      <div><div class="h-title" style="line-height:1.25">${esc(session.title || "Untitled")}</div>
        <div style="display:flex;gap:6px;margin-top:8px"><span class="tag dot" style="color:var(--primary)">${esc(sourceLabel(session))}</span></div>
      </div>
      <div id="shareOut">${shareOpenFor === session.id ? shareBlockHtml(studySet) : ""}</div>
      ${
        studySet
          ? `<div class="block" style="display:flex;flex-direction:column;gap:9px">
               <div class="prog-line" style="font-size:12px"><span style="font-weight:650;color:var(--ink)">${s.progress}% mastered</span><span>${s.mastered} of ${s.total}</span></div>
               <div class="bar ${s.progress === 100 ? "ok" : ""}"><i style="width:${s.progress}%"></i></div>
             </div>
             <div class="seg">
               <button data-action="tab" data-tab="cards" class="${tab === "cards" ? "on" : ""}">Flashcards</button>
               <button data-action="tab" data-tab="quiz" class="${tab === "quiz" ? "on" : ""}">Quiz</button>
               <button data-action="tab" data-tab="summary" class="${tab === "summary" ? "on" : ""}">Summary</button>
             </div>`
          : ""
      }
      ${body}
    </div>
    ${
      studySet && tab === "cards" && s.total
        ? `<div class="footer-cta"><button class="btn btn-primary btn-block" data-action="set-review" data-id="${esc(session.id)}">${
            s.due ? `Review ${s.due} due` : `Study ahead · ${s.total} cards`
          }</button></div>`
        : ""
    }`);
}

async function makeSet(sessionId) {
  // Regenerating an existing set replaces its cards — warn first. Cards whose
  // fronts survive the regen keep their SM-2 schedule (service worker).
  const { studySets } = await bundle();
  if (setFor(sessionId, studySets)) {
    const okToReplace = confirm(
      "Regenerate this set from its source?\n\n" +
        "Existing cards and quiz questions are replaced. Cards that come back with the same front keep their review schedule; everything else starts fresh. Your exam date and summary are kept."
    );
    if (!okToReplace) return;
  }
  showChrome(false);
  setHTML(app, `
    <div class="view">
      <div class="ahd"><div class="h-title"><span class="spinner" style="border-color:var(--border);border-top-color:var(--primary)"></span>Generating…</div></div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div class="genstep done"><span class="tick"><svg class="ic ic-sm" viewBox="0 0 24 24" style="stroke:#fff"><path d="M5 12l4 4 10-10"/></svg></span>Conversation saved</div>
        <div class="genstep run"><span class="tick"></span>Writing flashcards</div>
        <div class="genstep wait"><span class="tick"></span>Building a quiz</div>
      </div>
      <div class="block"><div class="help">This can take 5–15 seconds.</div></div>
    </div>`);
  topOfView();
  try {
    await send({ type: "GENERATE_STUDY_SET", sessionId });
    toast("Your flashcards are ready");
    syncNow().catch(() => {}); // background sync — silent if offline/signed out
    renderSetDetail(sessionId, "cards");
  } catch (e) {
    toast(e.message);
    renderSetDetail(sessionId, "cards");
  }
}

// ================================================================ REVIEW (focus)
let queue = [],
  qIdx = 0,
  focusReturn = "home";
// Distinct cards graded this sitting. Not queue.length — relearning requeues a
// lapsed card, which would otherwise count it twice on the done screen.
const reviewedIds = new Set();

function startReview(items, ret) {
  queue = items;
  qIdx = 0;
  reviewedIds.clear();
  focusReturn = ret;
  showChrome(false);
  paintReviewCard();
}

function gradePreview(card, g, examDate) {
  return review(card, g, Date.now(), examDate).interval;
}

function paintReviewCard() {
  if (qIdx >= queue.length) return paintReviewDone();
  const { card } = queue[qIdx];
  setHTML(app, `
    <div class="rev-top">${XBTN}<div class="bar"><i style="width:${Math.round((qIdx / queue.length) * 100)}%"></i></div>
      <span class="rev-count tnum">${qIdx + 1} / ${queue.length}</span></div>
    <div class="rev-body">
      <div class="flashcard" data-action="flip">
        <div class="lab">Question</div>
        <div class="front">${esc(card.front)}</div>
      </div>
      <div class="flip-hint">Tap the card to reveal the answer</div>
    </div>`);
}

function revealCard() {
  const { card } = queue[qIdx];
  const fc = app.querySelector(".flashcard");
  fc.removeAttribute("data-action");
  setHTML(fc, `<div class="lab">Question</div><div class="front">${esc(card.front)}</div>
    <div class="rule"></div><div class="back">${esc(card.back || "—")}</div>`);
  const hint = app.querySelector(".flip-hint");
  replaceHTML(hint, `<div class="grades">
      <button class="grade again" data-action="grade" data-g="0"><span class="g">Again</span><span class="iv">${gradePreview(card, 0, queue[qIdx].examDate)}d</span></button>
      <button class="grade" data-action="grade" data-g="3"><span class="g">Hard</span><span class="iv">${gradePreview(card, 3, queue[qIdx].examDate)}d</span></button>
      <button class="grade good" data-action="grade" data-g="4"><span class="g">Good</span><span class="iv">${gradePreview(card, 4, queue[qIdx].examDate)}d</span></button>
      <button class="grade good" data-action="grade" data-g="5"><span class="g">Easy</span><span class="iv">${gradePreview(card, 5, queue[qIdx].examDate)}d</span></button>
    </div>
    <button class="btn btn-ghost btn-block" data-action="apply-card" style="margin-top:10px">🎯 Apply it — fresh scenario</button>`);
}

async function gradeCard(g) {
  const item = queue[qIdx];
  const prevInterval = item.card.interval ?? 0;
  const upd = review(item.card, g, Date.now(), item.examDate);
  Object.assign(item.card, upd);
  await updateCard(item.sessionId, item.card.id, upd);
  await Promise.all([
    bumpActivity(1),
    appendReviewLog({
      id: uid(), cardId: item.card.id, sessionId: item.sessionId, grade: g,
      prevInterval, newInterval: upd.interval, reviewedAt: new Date().toISOString(),
    }),
  ]);
  reviewedIds.add(item.card.id);
  qIdx++;
  // Relearning step: a lapsed card comes back a few positions later in this
  // sitting (Anki-style), so "Again" does not hide it until tomorrow. The
  // STORED schedule stays day-level (+1 day) for future sessions. Capped at 2
  // requeues per card so an endless "Again" loop cannot stall the session.
  if (g < 3 && (item.relearns || 0) < 2) {
    item.relearns = (item.relearns || 0) + 1;
    queue.splice(Math.min(qIdx + 3, queue.length), 0, item);
  }
  paintReviewCard();
}

// --- Apply step: a fresh hypothetical per concept, then typed grading --------
let applyState = null; // { item, hypothetical, phase }

async function startApply() {
  const item = queue[qIdx];
  if (!item || !item.card.back) return paintReviewCard();
  applyState = { item, phase: "loading" };
  setHTML(app, `
    <div class="rev-top">${XBTN}<div class="bar"><i style="width:${Math.round((qIdx / queue.length) * 100)}%"></i></div>
      <span class="rev-count tnum">${qIdx + 1} / ${queue.length}</span></div>
    <div class="rev-body">
      <div class="t-label">Apply it</div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
        <span class="spinner" style="border-color:var(--border);border-top-color:var(--primary)"></span>
        <span style="font-size:13px;color:var(--muted)">Writing a fresh scenario…</span>
      </div>
    </div>`);
  try {
    const r = await send({
      type: "GENERATE_HYPOTHETICAL",
      concept: item.card.front,
      reference: item.card.back,
    });
    applyState.hypothetical = r.hypothetical;
    applyState.phase = "answer";
    paintApplyAnswer();
  } catch (e) {
    toast(e.message);
    qIdx++;
    paintReviewCard();
  }
}

function paintApplyAnswer() {
  const { hypothetical } = applyState;
  setHTML(app, `
    <div class="rev-top">${XBTN}<div class="bar"><i style="width:${Math.round((qIdx / queue.length) * 100)}%"></i></div>
      <span class="rev-count tnum">${qIdx + 1} / ${queue.length}</span></div>
    <div class="rev-body">
      <div class="t-label">Apply it — new scenario</div>
      <div class="hypothetical">${esc(hypothetical.scenario)}</div>
      <textarea id="applyAnswer" class="sa-input" rows="4" placeholder="Type your answer…"></textarea>
      <button class="btn btn-primary btn-block" data-action="apply-check">Check answer</button>
    </div>`);
}

async function checkApply() {
  const answer = document.getElementById("applyAnswer")?.value.trim();
  if (!answer) return toast("Type an answer first.");
  const { item, hypothetical } = applyState;
  const btn = app.querySelector('[data-action="apply-check"]');
  btn.disabled = true;
  btn.textContent = "Grading…";
  try {
    const r = await send({
      type: "GRADE_ANSWER",
      question: hypothetical.scenario,
      reference: hypothetical.rubric,
      answer,
    });
    await Promise.all([
      bumpActivity(1),
      appendReviewLog({
        id: uid(), cardId: item.card.id, sessionId: item.sessionId,
        grade: r.grading.correct ? 4 : 1, prevInterval: 0, newInterval: 0,
        reviewedAt: new Date().toISOString(),
      }),
    ]);
    paintGraded(r.grading, "apply-next");
  } catch (e) {
    toast(e.message);
    btn.disabled = false;
    btn.textContent = "Check answer";
  }
}

/** Shared score + feedback panel for AI-graded typed answers. */
function paintGraded(grading, nextAction) {
  const box = document.createElement("div");
  box.className = "graded";
  setHTML(box, `
    <div class="score-row">
      <div class="score tnum ${grading.correct ? "ok" : "no"}">${grading.score}</div>
      <div><b style="color:${grading.correct ? "var(--success)" : "var(--danger)"}">${grading.correct ? "Correct" : "Needs work"}</b>
        <div class="feedback">${esc(grading.feedback)}</div></div>
    </div>
    <button class="btn btn-primary btn-block" data-action="${nextAction}">Continue</button>`);
  const body = app.querySelector(".rev-body");
  if (body) {
    body.querySelector(".sa-input")?.remove();
    body.querySelector('[data-action="apply-check"]')?.remove();
    body.querySelector('[data-action="typed-check"]')?.remove();
    body.appendChild(box);
  }
}

// --- Coding practice: a standalone session started from the set ------------
// A peer of typed practice, NOT part of the review queue — each exercise is
// an LLM round trip plus real writing time, so sessions are short (5) and
// never block grading. The starter stub keeps exercises small; length is only
// ever a system cap (see storage/coding.js).
let codingState = null; // { sessionId, items, idx, task }

async function startCodingPractice(sessionId) {
  const { studySets } = await bundle();
  const set = setFor(sessionId, studySets);
  const cards = (set?.flashcards || []).filter((c) => c.back);
  if (!cards.length) return toast("This set has no cards to practise with yet.");
  const due = cards.filter((c) => isDue(c));
  const items = (due.length ? due : cards).slice(0, 5).map((card) => ({ sessionId, card }));
  codingState = { sessionId, items, idx: 0, task: null };
  focusReturn = "set:" + sessionId;
  showChrome(false);
  paintCodingQ();
}

function paintCodingQ() {
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
async function requestCodingTask() {
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

function paintCodeEditor() {
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
    const { selectionStart: a, selectionEnd: b, value } = ta;
    ta.value = value.slice(0, a) + "  " + value.slice(b);
    ta.selectionStart = ta.selectionEnd = a + 2;
    paintCodeCount();
  });
  ta.addEventListener("input", paintCodeCount);
  paintCodeCount();
  ta.focus();
  ta.selectionStart = ta.selectionEnd = ta.value.length;
}

/** Live counter. The cap disables submit; the target never does. */
function paintCodeCount() {
  const ta = document.getElementById("codeInput");
  const out = document.getElementById("codeCount");
  const btn = app.querySelector('[data-action="code-check"]');
  if (!ta || !out || !btn) return;
  const s = codeSize(ta.value, codingState.task.expectedLines);

  out.textContent = s.overCap
    ? `${s.chars} / ${s.cap} characters — too long to submit`
    : `${s.lines} line${s.lines === 1 ? "" : "s"}${s.verbose ? " · longer than needed" : ""}`;
  out.classList.toggle("over", s.overCap);
  out.classList.toggle("warn", !s.overCap && s.verbose);
  btn.disabled = s.overCap || s.empty;
}

async function checkCode() {
  if (!codingState?.task) return toast("Practice stopped.");
  const ta = document.getElementById("codeInput");
  const { items, idx, task, sessionId } = codingState;
  const { card } = items[idx];
  const s = codeSize(ta?.value, task.expectedLines);
  if (s.empty) return toast("Write some code first.");
  if (s.overCap) return toast(`That\'s too long — keep it under ${MAX_CODE_CHARS} characters.`);

  const btn = app.querySelector('[data-action="code-check"]');
  btn.disabled = true;
  btn.textContent = "Reviewing…";
  try {
    const r = await send({
      type: "GRADE_CODING",
      task: task.scenario,
      rubric: task.rubric,
      language: task.language,
      expectedLines: task.expectedLines,
      code: ta.value,
    });
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
    btn.disabled = false;
    btn.textContent = "Submit for review";
  }
}

/**
 * Per-requirement checklist rather than one number: for code the useful signal
 * is WHICH requirement failed. Conciseness is reported, never punished on its
 * own — a correct-but-long solution still reads as correct.
 */
function paintCodeGraded(g) {
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
let typedState = null; // { sessionId, items, idx }

async function startTypedPractice(sessionId) {
  const { studySets } = await bundle();
  const set = setFor(sessionId, studySets);
  const cards = (set?.flashcards || []).filter((c) => c.back);
  if (!cards.length) return toast("This set has no cards yet.");
  const due = cards.filter((c) => isDue(c));
  const items = (due.length ? due : cards).slice(0, 10).map((card) => ({ sessionId, card }));
  typedState = { sessionId, items, idx: 0 };
  focusReturn = "set:" + sessionId;
  showChrome(false);
  paintTypedQ();
}

function paintTypedQ() {
  const { items, idx } = typedState;
  if (idx >= items.length) {
    setHTML(app, `
      <div class="view">
        <div class="done-msg"><div class="big">✍️</div>
          <div style="font-weight:650;color:var(--ink)">Practice complete</div>
          <div style="margin-top:4px">${items.length} typed answer${items.length === 1 ? "" : "s"} graded.</div>
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
      <div class="t-label">Type the answer</div>
      <div style="font-size:16px;font-weight:600;line-height:1.35">${esc(card.front)}</div>
      <textarea id="typedAnswer" class="sa-input" rows="3" placeholder="Answer in your own words…"></textarea>
      <button class="btn btn-primary btn-block" data-action="typed-check">Check answer</button>
      <div class="help" style="margin:0;text-align:center">AI-graded against this card's answer.</div>
    </div>`);
}

async function checkTyped() {
  const answer = document.getElementById("typedAnswer")?.value.trim();
  if (!answer) return toast("Type an answer first.");
  const { card } = typedState.items[typedState.idx];
  const btn = app.querySelector('[data-action="typed-check"]');
  btn.disabled = true;
  btn.textContent = "Grading…";
  try {
    const r = await send({ type: "GRADE_ANSWER", question: card.front, reference: card.back, answer });
    await Promise.all([
      bumpActivity(1),
      appendReviewLog({
        id: uid(), cardId: card.id, sessionId: typedState.sessionId,
        grade: r.grading.correct ? 4 : 1, prevInterval: 0, newInterval: 0,
        reviewedAt: new Date().toISOString(),
      }),
    ]);
    paintGraded(r.grading, "typed-next");
  } catch (e) {
    toast(e.message);
    btn.disabled = false;
    btn.textContent = "Check answer";
  }
}

async function paintReviewDone() {
  showChrome(false);
  const reviewed = reviewedIds.size || queue.length;
  syncNow().catch(() => {}); // push grades + pull changes after a session

  const paint = (cta) =>
    setHTML(app, `
      <div class="view">
        <div class="done-msg"><div class="big">🎉</div>
          <div style="font-weight:650;color:var(--ink)">Review complete</div>
          <div style="margin-top:4px">${reviewed} card${reviewed === 1 ? "" : "s"} reviewed.</div>
        </div>
        ${cta}
        <button class="btn btn-${cta ? "ghost" : "primary"} btn-block" data-action="return-focus">Done</button>
      </div>`);

  paint("");

  // Recognition (flashcards) then recall under pressure (quiz) is the natural
  // next step — offer it, but only when the whole queue came from one set.
  const ids = [...new Set(queue.map((i) => i.sessionId))];
  if (ids.length !== 1) return;
  const { studySets } = await bundle();
  const set = setFor(ids[0], studySets);
  if (!set?.quiz?.length) return;
  const n = quickQuizLen(set); // must match what the button actually launches
  paint(
    `<div class="help" style="margin:0 0 10px;text-align:center">You've seen the answers — now try recalling them cold.</div>
     <button class="btn btn-primary btn-block" data-action="quiz-after-review" data-id="${esc(ids[0])}">Take a quick quiz · ${n} question${n === 1 ? "" : "s"}</button>`
  );
}

// ================================================================ QUIZ (focus)
let quizSet = null,
  quizIdx = 0,
  quizScore = 0;

/** Default quiz length: ~10% of a big set, the whole thing for a small one. */
function quickQuizLen(studySet) {
  const total = studySet.flashcards?.length || 0;
  const available = studySet.quiz?.length || 0;
  if (total < 20) return available;
  return Math.max(1, Math.min(available, Math.round(total * 0.1)));
}

/** Fisher-Yates on a copy. */
function shuffled(arr) {
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
function shuffleQuiz(questions) {
  return shuffled(questions).map((q) => {
    const order = shuffled(q.options.map((_, i) => i));
    return { ...q, options: order.map((i) => q.options[i]), answer: order.indexOf(q.answer) };
  });
}

function startQuiz(studySet, ret, limit) {
  // Shuffle first, then slice — a Quick quiz draws a different sample each time.
  const qs = shuffleQuiz(studySet.quiz || []);
  quizSet = { quiz: limit > 0 ? qs.slice(0, limit) : qs };
  quizIdx = 0;
  quizScore = 0;
  focusReturn = ret;
  showChrome(false);
  paintQuizQ();
}

function paintQuizQ() {
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

function answerQuiz(i) {
  const q = quizSet.quiz[quizIdx];
  const opts = app.querySelectorAll("#opts .opt");
  opts.forEach((b, bi) => {
    b.disabled = true;
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

function paintQuizDone() {
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

// ================================================================ IMPORT
function unescapeSep(v) {
  return v.replace(/\\t/g, "\t").replace(/\\n/g, "\n");
}
/** Anki plain-text exports carry HTML (<br>, <div>, [sound:…]) — strip it. */
function stripAnkiMarkup(s) {
  return s
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(div|p|li)>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\[sound:[^\]]*\]/gi, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
function parseCards(text, termRaw, cardRaw, clean = false) {
  const termSep = unescapeSep(termRaw);
  const cardSep = unescapeSep(cardRaw);
  let rows;
  if (cardSep === "\n\n") rows = text.split(/\r?\n\s*\r?\n/);
  else if (cardSep === "\n") rows = text.split(/\r?\n/);
  else rows = text.split(cardSep);
  const cards = [];
  for (let row of rows) {
    row = row.trim();
    if (!row || row.startsWith("#")) continue; // Anki export headers/comments
    const i = row.indexOf(termSep);
    let front = i === -1 ? row : row.slice(0, i).trim();
    let back = i === -1 ? "" : row.slice(i + termSep.length).trim();
    if (clean) {
      front = stripAnkiMarkup(front);
      back = stripAnkiMarkup(back);
    }
    if (front) cards.push({ front, back });
  }
  return cards;
}
const importCards = () => {
  const clean = document.getElementById("importClean")?.checked;
  return parseCards(
    document.getElementById("importText").value,
    document.getElementById("termSep").value,
    document.getElementById("cardSep").value,
    clean
  );
};

function renderImport() {
  showChrome(false);
  setHTML(app, `
    <div class="view">
      <div class="ahd">
        <button class="iconbtn" data-action="nav-back" aria-label="Back"><svg class="ic" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>
        <div class="h-title" style="font-size:16px">Import flashcards</div><span style="width:32px"></span>
      </div>
      <div class="help"><b>Anki:</b> File → Export → "Notes in Plain Text" (.txt), then upload the file below (leave HTML cleanup on).<br>
        <b>Quizlet:</b> open a set page and click the floating <b>Import to Mafsar</b> button, or export (⋯ → Export, Tab + New line) and paste below. CSV/TSV works too.</div>
      <div class="field"><label>Title</label><input id="importTitle" type="text" placeholder="e.g. Biology — Chapter 3" /></div>
      <div style="display:flex;gap:10px;align-items:center">
        <button class="btn btn-ghost" style="flex:1" data-action="import-file">⇪ Load Anki/CSV file</button>
        <label style="display:flex;gap:6px;align-items:center;font-size:12.5px;color:var(--muted)">
          <input type="checkbox" id="importClean" checked /> clean HTML
        </label>
      </div>
      <input type="file" id="importFile" accept=".txt,.csv,.tsv,text/plain" class="hidden" />
      <div class="sep-row">
        <div class="field"><label>Term / definition</label>
          <select id="termSep"><option value="\\t">Tab</option><option value=",">Comma</option><option value=" - ">Dash</option><option value="|">Pipe</option></select></div>
        <div class="field"><label>Between cards</label>
          <select id="cardSep"><option value="\\n">New line</option><option value="\\n\\n">Blank line</option><option value=";">Semicolon</option></select></div>
      </div>
      <div class="field"><label>Content</label><textarea id="importText" rows="7" placeholder="term&#9;definition"></textarea></div>
      <div class="preview" id="importPreview"></div>
      <div style="display:flex;gap:10px">
        <button class="btn btn-ghost" style="flex:1" data-action="import-preview">Preview</button>
        <button class="btn btn-primary" style="flex:1" data-action="import-save">Import</button>
      </div>
    </div>`);
  topOfView();
}
function previewImport() {
  const cards = importCards();
  const box = document.getElementById("importPreview");
  if (!cards.length) {
    setHTML(box, '<div class="empty">No cards detected — try a different separator.</div>');
    return;
  }
  setHTML(
    box,
    `<div style="font-size:12.5px;color:var(--muted);margin-bottom:8px">${cards.length} card(s) detected</div>` +
    cards
      .slice(0, 3)
      .map((c) => `<div class="pv-card"><b>${esc(c.front)}</b><span>${esc(c.back)}</span></div>`)
      .join(""));
}
async function doImport() {
  const cards = importCards();
  if (!cards.length) return toast("Couldn't read that. Check there\'s one card per line.");
  const title = document.getElementById("importTitle").value.trim() || "Imported flashcards";
  const now = Date.now();
  const flashcards = cards.map((c) => ({ id: uid(), front: c.front, back: c.back, ...initSchedule(now) }));
  const session = await addSession({
    source: "quizlet",
    sourceLabel: "Imported",
    title,
    url: "",
    capturedAt: now,
    messages: [],
    importedCount: flashcards.length,
  });
  await saveStudySet({ sessionId: session.id, title, createdAt: now, flashcards, quiz: [] });
  toast(`Imported ${flashcards.length} cards`);
  renderHome();
}

// ================================================================ TEAMS
// Account-backed study groups: create one, share the code/link, compare
// progress on a leaderboard. The share-code receiver ("Add a shared set")
// lives here too — both bring other people's studying into yours.
let sharedPreview = null; // { code, title, cards, quiz }

async function renderTeams() {
  setNav("teams");
  showChrome(true);
  sharedPreview = null;
  const auth = await getAuth();

  // Teams are the one feature that needs the account; everything else stays
  // offline-first. Signed out, explain and point at the You tab.
  if (!auth?.accessToken) {
    setHTML(app, `
      <div class="view">
        <div class="ahd"><div class="h-title">Teams</div></div>
        <div class="block tint" style="text-align:center">
          <div style="font-size:26px">👥</div>
          <div style="font-weight:650;margin-top:6px">Teams need an account</div>
          <div style="font-size:12.5px;color:var(--muted);margin-top:4px">Sign in to create a team, share its code, and follow a leaderboard with your study group. Everything else keeps working offline.</div>
          <button class="btn btn-primary" style="margin-top:12px" data-action="nav-you">Sign in on the You tab</button>
        </div>
      </div>`);
    topOfView();
    return;
  }

  let teams = [];
  let loadError = null;
  try {
    teams = (await send({ type: "TEAM_LIST" })).teams || [];
  } catch (e) {
    loadError = e.message;
  }

  const listHtml = loadError
    ? `<div class="empty">Couldn't load your teams.<br><span style="font-size:12px;color:var(--muted)">${esc(loadError)}</span></div>`
    : teams.length
    ? teams
        .map(
          (t) => `
        <div class="setrow" data-action="open-team" data-id="${esc(t.id)}">
          <div class="top"><div class="name">${esc(t.name)}</div><span class="tag">${t.memberCount} member${t.memberCount === 1 ? "" : "s"}</span></div>
          <div class="prog-line"><span>Code ${esc(t.code)}</span><span>Open</span></div>
        </div>`
        )
        .join("")
    : `<div class="empty">No teams yet.<br>Create one and share the code with your study group.</div>`;

  setHTML(app, `
    <div class="view teams-view">
      <div class="ahd"><div class="h-title">Teams</div></div>
      <div class="help" style="margin:0">A team is a study group with a shared code: everyone joins, then the leaderboard compares mastered cards.</div>
      <div class="listhd"><span class="t-label">Your teams</span></div>
      ${listHtml}
      <div class="team-actions">
        <div id="teamCreateForm" class="hidden" style="display:flex;flex-direction:column;gap:8px">
          <input id="teamName" type="text" placeholder="Team name" maxlength="80" autocomplete="off" aria-label="Team name" />
          <button class="btn btn-primary" data-action="team-create-save">Create team</button>
        </div>
        <button class="btn btn-primary" data-action="team-create">Create a team</button>
        <div class="join-row">
          <input id="teamCode" type="text" placeholder="Enter team code" autocomplete="off" autocapitalize="characters" aria-label="Enter team code" />
          <button class="btn btn-ghost" data-action="team-join">Join</button>
        </div>
      </div>
    </div>`);
  topOfView();
  document.getElementById("teamCode")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") joinTeamFromInput();
  });
  document.getElementById("teamName")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") createTeamFromForm();
  });
}

function toggleTeamCreateForm() {
  const form = document.getElementById("teamCreateForm");
  if (!form) return;
  const show = form.classList.contains("hidden");
  form.classList.toggle("hidden", !show);
  if (show) document.getElementById("teamName")?.focus();
}

async function createTeamFromForm() {
  const name = document.getElementById("teamName")?.value.trim();
  if (!name) return toast("Give the team a name first.");
  try {
    const r = await send({ type: "TEAM_CREATE", name });
    toast("Team created — share the code with your group");
    renderTeam(r.team.id);
  } catch (e) {
    toast(e.message);
  }
}

async function joinTeamFromInput() {
  const code = parseTeamCode(document.getElementById("teamCode")?.value || "");
  if (!code) return toast("Enter a team code first.");
  try {
    const r = await send({ type: "TEAM_JOIN", code });
    toast(`Joined ${r.team.name}`);
    renderTeam(r.team.id);
  } catch (e) {
    toast(e.message);
  }
}

async function renderTeam(id) {
  showChrome(false);
  let team = null;
  try {
    team = (await send({ type: "TEAM_GET", id })).team;
  } catch (e) {
    toast(e.message);
    return renderTeams();
  }
  const link = teamLinkFor(team.code, LANDING_BASE);
  const board = (team.leaderboard || [])
    .map(
      (m) => `
      <div class="lb-row">
        <span class="rank tnum">${m.rank}</span>
        <span class="who">${esc(m.email)}</span>
        <span class="tag">${m.mastered} mastered</span>
      </div>
      <div class="lb-sub">${m.reviews7d} review${m.reviews7d === 1 ? "" : "s"} this week · ${m.streak}-day streak</div>`
    )
    .join("");
  const learning = (team.learning || [])
    .map(
      (m) => `
      <div class="learn-row">
        <div class="who">${esc(m.email)}</div>
        <div class="tags">${
          m.titles?.length ? m.titles.map((t) => `<span class="tag">${esc(t)}</span>`).join("") : `<span class="tag">No sets yet</span>`
        }</div>
      </div>`
    )
    .join("");

  setHTML(app, `
    <div class="view">
      <div class="ahd">
        <button class="iconbtn" data-action="nav-teams" aria-label="Back"><svg class="ic" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>
        <div class="h-title" style="font-size:16px">${esc(team.name)}</div>
        <span style="width:32px"></span>
      </div>
      <div class="block" style="display:flex;flex-direction:column;gap:12px">
        ${copyRowHtml("Team link", link, "anyone with it can join")}
        ${copyRowHtml("Team code", team.code, "entered under Join a team", "share-code tnum")}
      </div>
      <div class="listhd"><span class="t-label">Leaderboard</span></div>
      <div class="block">${board || '<div class="empty">No members yet.</div>'}</div>
      <div class="listhd"><span class="t-label">Who's learning what</span></div>
      <div class="block">${learning || '<div class="empty">Nothing yet.</div>'}</div>
      <button class="btn btn-ghost btn-block" data-action="team-leave" data-id="${esc(team.id)}">Leave team</button>
    </div>`);
  topOfView();
}

async function leaveTeam(id) {
  if (!confirm("Leave this team? You can re-join any time with the team code.")) return;
  try {
    await send({ type: "TEAM_LEAVE", id });
    toast("Left the team");
  } catch (e) {
    toast(e.message);
  }
  renderTeams();
}

async function lookupShare() {
  const code = parseShareCode(document.getElementById("shareCode")?.value || "");
  if (!code) return toast("Enter a code first.");
  const out = document.getElementById("sharePreview");
  if (out) setHTML(out, '<div style="font-size:13px;color:var(--muted)">Looking up…</div>');
  try {
    const payload = await send({ type: "SHARE_FETCH", code });
    // Already added? Sessions keep the code they imported with, so a re-entry
    // is caught before a duplicate set appears.
    const { sessions } = await bundle();
    if (sessions.some((s) => s.shareCode === code)) {
      sharedPreview = null;
      if (out) setHTML(out, "");
      return toast("You already added this set.");
    }
    sharedPreview = { code, ...payload };
    paintSharePreview(out);
  } catch (e) {
    sharedPreview = null;
    if (out) setHTML(out, "");
    // The server words revoked and unknown the same way on purpose; offline
    // reads differently because the fix is different.
    if (/fetch|network|Failed/i.test(e.message)) toast("Can't reach the server — check your connection.");
    else if (/Unknown or revoked/i.test(e.message)) toast("That code isn't valid — revoked, or check for typos.");
    else toast(e.message);
  }
}

function paintSharePreview(out) {
  const target = out || document.getElementById("sharePreview");
  if (!target || !sharedPreview) return;
  const { title, cards, quiz } = sharedPreview;
  setHTML(target, `
    <div class="block" style="display:flex;flex-direction:column;gap:9px">
      <div class="t-label">Found</div>
      <div style="font-weight:650;color:var(--ink);line-height:1.3">${esc(title)}</div>
      <div style="font-size:12.5px;color:var(--muted)">Copy with ${cards.length} card${cards.length === 1 ? "" : "s"}${quiz?.length ? ` and ${quiz.length} quiz question${quiz.length === 1 ? "" : "s"}` : ""} — added fresh, reviews start from scratch.</div>
      <button class="btn btn-primary btn-block" data-action="share-import">Add to my sets</button>
    </div>`);
}

async function importSharedSet() {
  if (!sharedPreview) return;
  const { code, title, cards, quiz } = sharedPreview;
  const now = Date.now();
  // New ids everywhere: rows are keyed by id, so reusing the sender's would
  // collide with theirs (or a second import). Schedules start fresh.
  const flashcards = cards.map((c) => ({
    id: uid(), front: String(c.front), back: String(c.back ?? ""),
    updatedAt: new Date(now).toISOString(), ...initSchedule(now),
  }));
  const quizQs = (quiz || []).map((q) => ({
    id: uid(), q: String(q.q), options: (q.options || []).map(String),
    answer: Math.max(0, Number(q.answer) || 0), explain: String(q.explain ?? ""),
    updatedAt: new Date(now).toISOString(),
  }));
  const session = await addSession({
    source: "shared", sourceLabel: "Shared", title, url: "",
    capturedAt: now, messages: [], shareCode: code, importedCount: flashcards.length,
  });
  await saveStudySet({ sessionId: session.id, title, createdAt: now, flashcards, quiz: quizQs });
  syncNow().catch(() => {});
  toast(`Added ${flashcards.length} cards`);
  sharedPreview = null;
  renderSetDetail(session.id, "cards");
}

async function renderYou() {
  setNav("you");
  showChrome(true);
  const { studySets, activity, settings } = await bundle();
  let mastered = 0,
    total = 0;
  for (const s of studySets) {
    const x = summarize(s);
    mastered += x.mastered;
    total += x.total;
  }
  const streak = computeStreak(activity);
  const auth = await getAuth();

  const accountHtml = auth?.user
    ? `<div class="block" style="display:flex;flex-direction:column;gap:10px">
         <div style="display:flex;align-items:center;gap:10px">
           <span class="tag dot" style="color:var(--success)"></span>
           <div style="min-width:0">
             <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(auth.user.email)}</div>
             <div style="font-size:11.5px;color:var(--muted)">${
               auth.lastSync ? "Last synced " + new Date(auth.lastSync).toLocaleString() : "Not backed up yet"
             }</div>
           </div>
         </div>
         <button class="btn btn-ghost btn-block" data-action="auth-signout">Sign out</button>
       </div>`
    : `<div class="block" style="display:flex;flex-direction:column;gap:10px">
         <div style="font-weight:600;font-size:13px">Back up and sync</div>
         <div style="font-size:12px;color:var(--muted);line-height:1.5">Sign in to sync your sets across devices. Everything works offline without an account.</div>
         <div class="field"><label>Email</label><input id="youEmail" type="email" placeholder="you@example.com" autocomplete="email" /></div>
         <div class="field"><label>Password</label><input id="youPass" type="password" placeholder="8+ characters" autocomplete="new-password" /></div>
         <div style="display:flex;gap:10px">
           <button class="btn btn-primary" style="flex:1" data-action="auth-signin">Sign in</button>
           <button class="btn btn-ghost" style="flex:1" data-action="auth-register">Create account</button>
         </div>
       </div>`;

  setHTML(app, `
    <div class="view">
      <div class="ahd"><div class="wordmark">Maf<b>sar</b></div></div>
      <div class="block" style="text-align:center;padding:20px">
        <div style="font-size:13px;color:var(--muted)">${auth?.user ? "Your sets are backed up" : "Everything stays on this device"}</div>
        <div style="display:flex;justify-content:center;gap:8px;margin-top:12px">
          <span class="streak">${FLAME}${streak}-day streak</span>
        </div>
      </div>
      <div class="stats">
        <div class="stat"><div class="v tnum">${mastered}</div><div class="k">Mastered</div></div>
        <div class="stat"><div class="v tnum">${total}</div><div class="k">Cards</div></div>
        <div class="stat"><div class="v tnum">${studySets.length}</div><div class="k">Sets</div></div>
      </div>
      ${accountHtml}
            <div class="listhd"><span class="t-label">Backup</span></div>
      <div style="display:flex;gap:10px">
        <button class="btn btn-ghost" style="flex:1" data-action="export-backup">⇩ Export JSON</button>
        <button class="btn btn-ghost" style="flex:1" data-action="import-backup">⇪ Restore</button>
      </div>
      <input type="file" id="backupFile" accept="application/json,.json" class="hidden" />
    </div>`);
  topOfView();
}

// --- account actions ---------------------------------------------------------
async function authSubmit(kind) {
  const email = document.getElementById("youEmail")?.value.trim();
  const password = document.getElementById("youPass")?.value;
  if (!email || !password) return toast("Enter an email and password.");
  if (password.length < 8) return toast("Password needs at least 8 characters.");
  const wasSignedIn = !!(await getAuth())?.user;
  toast(kind === "register" ? "Creating account…" : "Signing in…");
  try {
    const user = kind === "register" ? await register(email, password) : await login(email, password);
    toast("Signed in");
    try {
      const r = await syncNow();
      if (!r.skipped) toast(r.pulled === 0 ? "Up to date" : "Updated from your other devices");
    } catch { /* offline is fine */ }
    // From the first-launch gate go Home; from the You tab stay on You.
    wasSignedIn ? renderYou() : renderHome();
  } catch (e) {
    toast(e.message);
  }
}



// ================================================================ capture current tab
async function captureCurrent() {
  toast("Capturing…");
  const tab = await queryActiveTab();
  if (!tab?.id) return toast("Open a page to capture first.");
  // Try the site adapter first (clean capture on AI-chat sites)…
  const resp = await sendToTab(tab.id, { type: "CAPTURE_ACTIVE" });
  let r;
  try {
    if (resp?.ok) {
      r = await send({ type: "SAVE_AND_GENERATE", payload: resp.session });
    } else {
      // …otherwise fall back to universal page-text capture on any site.
      r = await send({ type: "CAPTURE_UNIVERSAL" });
    }
    if (r.generated) toast(`${r.cards} flashcards ready`);
    else toast("Saved, but we couldn\'t make flashcards. Open the set to try again.");
    renderHome();
  } catch (e) {
    toast(e.message);
  }
}

// ================================================================ action router
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-action]");
  if (!t) return;
  const a = t.dataset.action;
  const id = t.dataset.id;
  switch (a) {
    case "open-import": renderImport(); break;
    case "nav-back": goToActiveTab(); break;
    case "nav-sets": renderSets(); break;
    case "open-set": renderSetDetail(id); break;
    case "make-set": makeSet(id); break;
    case "capture-current": captureCurrent(); break;
    case "tab": renderSetDetail(detail.session.id, t.dataset.tab); break;
    case "delete-set":
      if (confirm("Delete this set and its cards?")) deleteSession(id).then(goToActiveTab);
      break;
    case "start-review": startGlobalReview(); break;
    case "set-review": startSetReview(id); break;
    case "flip": revealCard(); break;
    case "grade": gradeCard(Number(t.dataset.g)); break;
    case "apply-card": startApply(); break;
    case "set-mode":
      (async () => {
        const { studySets } = await bundle();
        const set = setFor(t.dataset.id, studySets);
        if (!set || (set.mode || "general") === t.dataset.mode) return;
        set.mode = t.dataset.mode;
        await saveStudySet(set);
        toast(t.dataset.mode === "coding" ? "Coding mode on — review now asks for code." : "General mode on.");
        renderSetDetail(t.dataset.id, "summary");
      })();
      break;
    case "start-coding": startCodingPractice(id); break;
    case "set-share": toggleSetShare(id); break;
    case "share-copy": copyShareCode(t.dataset.code, t); break;
    case "share-revoke": revokeShareFor(t.dataset.id); break;
    case "open-team": renderTeam(id); break;
    case "team-create": toggleTeamCreateForm(); break;
    case "team-create-save": createTeamFromForm(); break;
    case "team-join": joinTeamFromInput(); break;
    case "team-leave": leaveTeam(id); break;
    case "nav-teams": renderTeams(); break;
    case "nav-you": renderYou(); break;
    case "select-all":
      t.select();
      copyShareCode(t.value, t.nextElementSibling);
      break;
    case "share-lookup": lookupShare(); break;
    case "share-import": importSharedSet(); break;
    case "code-check": checkCode(); break;
    case "code-next": codingState.idx++; paintCodingQ(); break;
    case "apply-check": checkApply(); break;
    case "apply-next": qIdx++; paintReviewCard(); break;
    case "start-typed": startTypedPractice(id); break;
    case "typed-check": checkTyped(); break;
    case "typed-next": typedState.idx++; paintTypedQ(); break;
    case "clear-exam": setExamDate(id, null).then(() => renderSetDetail(id, "cards")); break;
    case "add-card": promptAddCard(id); break;
    case "card-edit": editingCardId = id; paintDetail(); break;
    case "edit-cancel": editingCardId = null; paintDetail(); break;
    case "edit-save":
      saveCardEdit(detail.session.id, id).then(() => {
        editingCardId = null;
        renderSetDetail(detail.session.id, "cards");
      });
      break;
    case "card-del":
      if (confirm("Delete this card?")) deleteCard(detail.session.id, id).then(() => paintDetail());
      break;
    // case "export-tsv": exportSetTsv(id); break; // paused with the export button
    case "gen-summary": generateSummary(id); break;
    case "export-backup": exportBackup(); break;
    case "import-backup": document.getElementById("backupFile")?.click(); break;
    case "auth-signin": authSubmit("login"); break;
    case "auth-register": authSubmit("register"); break;
    case "auth-signout":
      logout().then(() => {
        toast("Signed out. Your sets stay on this device.");
        renderYou();
      });
      break;
    case "exam-pick": openExamPicker(); break;
    case "exam-clear":
      (async () => {
        const { studySets } = await bundle();
        for (const s of studySets) if (s.examDate) await setExamDate(s.sessionId, null);
        toast("Exam cleared");
        renderHome();
      })();
      break;
    case "picker-save": saveExamSelection(); break;
    case "quiz-len":
      app.querySelectorAll(".qlen").forEach((b) => {
        const on = b === t;
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", String(on));
      });
      app.querySelector('[data-action="start-quiz"]').dataset.n = t.dataset.n;
      break;
    case "start-quiz":
      startQuiz(detail.studySet, "set:" + detail.session.id, Number(t.dataset.n) || 0);
      break;
    case "quiz-after-review":
      (async () => {
        const id = t.dataset.id;
        const { studySets } = await bundle();
        const set = setFor(id, studySets);
        if (set?.quiz?.length) startQuiz(set, "set:" + id, quickQuizLen(set));
      })();
      break;
    case "quiz-opt": answerQuiz(Number(t.dataset.i)); break;
    case "quiz-next": quizIdx++; paintQuizQ(); break;
    case "import-preview": previewImport(); break;
    case "import-save": doImport(); break;
    case "import-file": document.getElementById("importFile")?.click(); break;
    case "close-focus":
    case "return-focus": goReturn(); break;
  }
});

function goReturn() {
  codingState = null;
  const ret = focusReturn;
  if (typeof ret === "string" && ret.startsWith("set:")) renderSetDetail(ret.slice(4));
  else renderHome();
}

async function startGlobalReview() {
  const { studySets } = await bundle();
  const items = [];
  studySets.forEach((set) =>
    (set.flashcards || []).forEach((card) => isDue(card) && items.push({ sessionId: set.sessionId, card, examDate: set.examDate }))
  );
  items.sort((a, b) => byDue(a.card, b.card));
  if (!items.length) return toast("Nothing due right now — you're all caught up");
  startReview(items, "home");
}
async function startSetReview(sessionId) {
  const { studySets } = await bundle();
  const set = setFor(sessionId, studySets);
  // Due cards first; if none are due yet, fall through to studying ahead
  // (still applies SM-2 normally) so the button always does something.
  const due = (set?.flashcards || []).filter((c) => isDue(c));
  const pool = due.length ? due : set?.flashcards || [];
  const items = pool.map((card) => ({ sessionId, card, examDate: set?.examDate }));
  items.sort((a, b) => byDue(a.card, b.card));
  if (!items.length) return toast("This set has no cards yet.");
  startReview(items, "set:" + sessionId);
}

// ================================================================ card editing / export / summary / backup
async function promptAddCard(sessionId) {
  editingCardId = null;
  detail.addingCard = true;
  paintAddCard();
}
function paintAddCard() {
  const btn = app.querySelector('[data-action="add-card"]');
  const html = `<div class="block editcard">
      <div class="field"><label>Front</label><textarea id="newFront" rows="2" placeholder="Question / term"></textarea></div>
      <div class="field"><label>Back</label><textarea id="newBack" rows="3" placeholder="Answer / definition"></textarea></div>
      <div style="display:flex;gap:10px">
        <button class="btn btn-ghost" style="flex:1" data-action="add-cancel">Cancel</button>
        <button class="btn btn-primary" style="flex:1" data-action="add-save" data-id="${esc(detail.session.id)}">Add card</button>
      </div>
    </div>`;
  if (btn) insertHTMLBefore(btn.closest("div"), html);
}
async function saveNewCard(sessionId) {
  const front = document.getElementById("newFront")?.value.trim();
  const back = document.getElementById("newBack")?.value.trim();
  if (!front) return toast("Add a question first.");
  await addCard(sessionId, front, back || "");
  toast("Card added");
  renderSetDetail(sessionId, "cards");
}
async function saveCardEdit(sessionId, cardId) {
  const front = document.getElementById("editFront")?.value.trim();
  const back = document.getElementById("editBack")?.value.trim();
  if (!front) return toast("Add a question first.");
  await updateCard(sessionId, cardId, { front, back: back || "" });
  toast("Card saved");
}

function downloadFile(filename, text, type = "text/plain") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** Anki-friendly TSV: tabs separate front/back; newlines separate cards. */
async function exportSetTsv(sessionId) {
  const { studySets } = await bundle();
  const set = setFor(sessionId, studySets);
  if (!set?.flashcards?.length) return toast("This set has no cards yet.");
  const tsv = set.flashcards
    .map((c) => `${c.front.replace(/\t/g, " ").replace(/\r?\n/g, " ")}\t${(c.back || "").replace(/\t/g, " ").replace(/\r?\n/g, " ")}`)
    .join("\n");
  downloadFile(`${(set.title || "mafsar-set").replace(/[^\w\- ]+/g, "")}.txt`, tsv, "text/tab-separated-values");
  toast(`Exported ${set.flashcards.length} cards`);
}

async function generateSummary(sessionId) {
  toast("Summarizing…");
  try {
    await send({ type: "SUMMARIZE", sessionId });
    renderSetDetail(sessionId, "summary");
  } catch (e) {
    toast(e.message);
  }
}

async function exportBackup() {
  const data = await exportAll();
  downloadFile(`mafsar-backup-${dayKey()}.json`, JSON.stringify(data, null, 2), "application/json");
  toast("Backup downloaded");
}

function importBackupFile(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      if (!confirm("Restore this backup? It replaces ALL local Mafsar data.")) return;
      await importAll(JSON.parse(String(reader.result)));
      toast("Backup restored");
      renderHome();
    } catch (e) {
      toast(e.message || "Invalid backup file.");
    }
  };
  reader.readAsText(file);
}

// date inputs + file input don't fire click-based data-action routing
document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.id === "examDate" && t.dataset.session) {
    const ms = t.value ? new Date(`${t.value}T23:59:59`).getTime() : null;
    setExamDate(t.dataset.session, ms).then(() => {
      toast(ms ? "Exam date set. Cards will resurface before it." : "Exam date cleared");
      renderSetDetail(t.dataset.session, "cards");
    });
  } else if (t.id === "homeExamDate") {
    // Date changed on Home: if an exam already exists, move it for every
    // selected set; otherwise draft it and go pick sets.
    const ms = t.value ? new Date(`${t.value}T23:59:59`).getTime() : null;
    (async () => {
      const { studySets } = await bundle();
      const selected = studySets.filter((s) => s.examDate);
      if (selected.length && ms) {
        for (const s of selected) await setExamDate(s.sessionId, ms);
        toast("Exam date updated");
        renderHome();
      } else {
        examDraft = { date: ms, picked: new Set() };
        openExamPicker();
      }
    })();
  } else if (t.id === "pickerDate") {
    if (examDraft) examDraft.date = t.value ? new Date(`${t.value}T23:59:59`).getTime() : null;
  } else if (t.classList?.contains("picker-check")) {
    if (examDraft) t.checked ? examDraft.picked.add(t.dataset.id) : examDraft.picked.delete(t.dataset.id);
  } else if (t.id === "backupFile" && t.files?.[0]) {
    importBackupFile(t.files[0]);
    t.value = "";
  } else if (t.id === "importFile" && t.files?.[0]) {
    const file = t.files[0];
    t.value = "";
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      document.getElementById("importText").value = text;
      // Auto-title from the filename ("Spanish Verbs.txt" -> "Spanish Verbs"),
      // and default the term separator to Tab — Anki's plain-text export format.
      const titleEl = document.getElementById("importTitle");
      if (titleEl && !titleEl.value.trim()) {
        titleEl.value = file.name.replace(/\.(txt|csv|tsv)$/i, "").replace(/[_-]+/g, " ") || "Imported";
      }
      if (/\.tsv$/i.test(file.name) || /\.txt$/i.test(file.name)) {
        document.getElementById("termSep").value = "\\t";
        document.getElementById("cardSep").value = "\\n";
      }
      previewImport();
    };
    reader.readAsText(file);
  }
});

// extra actions that need the add-card form state
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-action]");
  if (!t) return;
  if (t.dataset.action === "add-cancel") renderSetDetail(detail.session.id, "cards");
  if (t.dataset.action === "add-save") saveNewCard(t.dataset.id);
});
// bottom nav
nav.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-nav]");
  if (!b) return;
  const n = b.dataset.nav;
  if (n === "review") return startGlobalReview();
  if (n === "home") renderHome();
  else if (n === "sets") renderSets();
  else if (n === "teams") renderTeams();
  else if (n === "you") renderYou();
});

// --- first-launch auth gate: an account is required (backend-first) ---------
function renderAuthGate() {
  showChrome(false);
  setHTML(app, `
    <div class="view" style="justify-content:center;min-height:100%">
      <div style="text-align:center;margin-bottom:8px">
        <div class="wordmark" style="font-size:26px">Maf<b>sar</b></div>
        <div style="font-size:13px;color:var(--muted);margin-top:6px;line-height:1.5">
          Turn your AI chats into flashcards,<br>quizzes, and spaced-repetition review.
        </div>
      </div>
      <div class="block" style="display:flex;flex-direction:column;gap:10px">
        <div class="field"><label>Email</label><input id="youEmail" type="email" placeholder="you@example.com" autocomplete="email" /></div>
        <div class="field"><label>Password</label><input id="youPass" type="password" placeholder="8+ characters" autocomplete="new-password" /></div>
        <button class="btn btn-primary btn-block" data-action="auth-register">Create account</button>
        <button class="btn btn-ghost btn-block" data-action="auth-signin">Sign in</button>
      </div>
      <div class="help" style="text-align:center">Your sets sync across devices through your account.</div>
    </div>`);
  topOfView();
}

// init — account required: gate first launch until signed in, then sync.
(async function init() {
  const auth = await getAuth();
  if (!auth?.accessToken) {
    renderAuthGate();
    return;
  }
  renderHome();
  syncNow().catch(() => {});
})();
