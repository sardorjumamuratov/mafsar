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
import { initSchedule, review, isDue, byDue, masteryOf } from "../storage/srs.js";
import { examReadiness, nextExam, weakTopics } from "../storage/readiness.js";
import { getAuth, register, login, logout } from "../sync/auth.js";
import { syncNow } from "../sync/sync.js";

const app = document.getElementById("app");
const nav = document.getElementById("bottomNav");

// ---------------------------------------------------------------- helpers
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const FLAME =
  '<svg viewBox="0 0 24 24"><path d="M13 2c.5 3.5-2.5 4.8-2.5 8A2.5 2.5 0 0 0 15 10c0-1-.3-1.8-.7-2.6 2.4 1.2 4.2 3.6 4.2 6.6a6.5 6.5 0 1 1-13 0c0-4.7 4-6.4 7.5-12z"/></svg>';
const XBTN =
  '<button class="iconbtn" data-action="close-focus" aria-label="Close"><svg class="ic" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';

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
    { chatgpt: "ChatGPT", claude: "Claude", gemini: "Gemini", quizlet: "Quizlet" }[session.source] ||
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

  const exam = nextExam(studySets, sessions);
  const examCard = exam
    ? `<div class="exam-card" data-action="open-set" data-id="${esc(exam.sessionId)}">
         <span class="exam-ic">🎯</span>
         <div><div class="t-label">Next exam</div>
           <div class="exam-title">${esc(exam.title)}</div>
           <div class="sub">${examDaysLeft(exam.examDate)}</div></div>
         <span class="tag">in ${Math.max(1, Math.ceil((exam.examDate - Date.now()) / 86400000))}d</span>
       </div>`
    : "";

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

  app.innerHTML = `
    <div class="view">
      <div class="ahd">
        <div><div class="h-sub">${greeting()}</div><div class="h-title">Ready to review</div></div>
        <div style="display:flex;gap:8px;align-items:center">
          <span class="streak">${FLAME}${streak}</span>
          <button class="iconbtn" data-action="settings" aria-label="Settings">
            <svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 0 0-1.7-1L14.5 2h-4l-.4 2.6a7 7 0 0 0-1.7 1l-2.3-1-2 3.4L4.1 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2-1.5c.1-.3.1-.7.1-1z"/></svg>
          </button>
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
    </div>`;
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
  app.innerHTML = `
    <div class="view">
      <div class="ahd"><div class="h-title">Your sets</div>
        <button class="btn btn-ghost" style="padding:8px 12px" data-action="open-import">⇪ Import</button></div>
      ${
        sessions.length
          ? sessions.map((s) => setRow(s, summarize(setFor(s.id, studySets)))).join("")
          : `<div class="empty"><div class="big">📚</div>No sets yet.<br>Capture an AI conversation with <b>Save to Mafsar</b>, or import from Quizlet.</div>`
      }
      <button class="btn btn-ghost btn-block" data-action="capture-current">＋ Capture this page</button>
    </div>`;
}

// ================================================================ SET DETAIL
let detail = null; // { session, studySet, summary, tab }
let editingCardId = null;

async function renderSetDetail(sessionId, tab = "cards") {
  showChrome(false);
  const { sessions, studySets } = await bundle();
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) return renderHome();
  const studySet = setFor(sessionId, studySets);
  detail = { session, studySet, tab };
  paintDetail();
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

    const examPanel = `
      <div class="block" style="display:flex;flex-direction:column;gap:10px">
        <div class="prog-line" style="font-size:12px"><span class="t-label" style="margin:0">Exam date</span>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="date" id="examDate" class="date-input" value="${dateInputValue(studySet.examDate)}" data-session="${esc(session.id)}" />
            ${studySet.examDate ? `<button class="linkbtn" data-action="clear-exam" data-id="${esc(session.id)}">Clear</button>` : ""}
          </div></div>
        ${
          exam
            ? `<div class="readiness">
                 <div class="r-cell"><div class="v tnum">${exam.daysLeft < 0 ? "—" : exam.daysLeft}</div><div class="k">days left</div></div>
                 <div class="r-cell"><div class="v tnum">${s.progress}%</div><div class="k">ready</div></div>
                 <div class="r-cell"><div class="v tnum">${exam.status === "past" ? "—" : exam.dailyTarget}</div><div class="k">cards/day</div></div>
                 <div class="r-cell"><div class="v" style="font-size:12px;color:${statusColor}">${statusLabel}</div><div class="k">status</div></div>
               </div>`
            : `<div class="help" style="margin:0">Set an exam date to get a countdown, daily target, and pre-exam resurfacing of cards.</div>`
        }
      </div>`;

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
      <div style="display:flex;gap:10px">
        <button class="btn btn-ghost" style="flex:1" data-action="add-card" data-id="${esc(session.id)}">＋ Card</button>
        <button class="btn btn-ghost" style="flex:1" data-action="start-typed" data-id="${esc(session.id)}">✍️ Type answers</button>
      </div>
      <button class="btn btn-ghost btn-block" data-action="export-tsv" data-id="${esc(session.id)}">⇩ Export to Anki/CSV</button>`;
  } else if (tab === "quiz") {
    body = studySet.quiz?.length
      ? `<div class="block" style="text-align:center">
           <div style="font-weight:650">${studySet.quiz.length}-question quiz</div>
           <div style="font-size:12.5px;color:var(--muted);margin:6px 0 14px">Test recall with multiple choice.</div>
           <button class="btn btn-primary btn-block" data-action="start-quiz">Start quiz</button>
         </div>`
      : `<div class="empty">No quiz for this set.<br>${
          session.source === "quizlet" ? "Imported sets are flashcards only." : "Regenerate to add one."
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
      <button class="btn btn-ghost btn-block" data-action="delete-set" data-id="${esc(session.id)}">Delete set</button>`;
  }

  app.innerHTML = `
    <div class="view">
      <div class="ahd">
        <button class="iconbtn" data-action="nav-home" aria-label="Back"><svg class="ic" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>
        ${studySet ? `<span class="tag">${s.total} cards</span>` : ""}
      </div>
      <div><div class="h-title" style="line-height:1.25">${esc(session.title || "Untitled")}</div>
        <div style="display:flex;gap:6px;margin-top:8px"><span class="tag dot" style="color:var(--primary)">${esc(sourceLabel(session))}</span></div>
      </div>
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
      studySet && tab === "cards" && s.due
        ? `<div class="footer-cta"><button class="btn btn-primary btn-block" data-action="set-review" data-id="${esc(session.id)}">Review ${s.due} due</button></div>`
        : ""
    }`;
}

async function makeSet(sessionId) {
  showChrome(false);
  app.innerHTML = `
    <div class="view">
      <div class="ahd"><div class="h-title"><span class="spinner" style="border-color:var(--border);border-top-color:var(--primary)"></span>Generating…</div></div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div class="genstep done"><span class="tick"><svg class="ic ic-sm" viewBox="0 0 24 24" style="stroke:#fff"><path d="M5 12l4 4 10-10"/></svg></span>Conversation saved</div>
        <div class="genstep run"><span class="tick"></span>Writing flashcards</div>
        <div class="genstep wait"><span class="tick"></span>Building a quiz</div>
      </div>
      <div class="block"><div class="help">This can take 5–15 seconds.</div></div>
    </div>`;
  try {
    await send({ type: "GENERATE_STUDY_SET", sessionId });
    toast("Study set ready!");
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

function startReview(items, ret) {
  queue = items;
  qIdx = 0;
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
  app.innerHTML = `
    <div class="rev-top">${XBTN}<div class="bar"><i style="width:${Math.round((qIdx / queue.length) * 100)}%"></i></div>
      <span class="rev-count tnum">${qIdx + 1} / ${queue.length}</span></div>
    <div class="rev-body">
      <div class="flashcard" data-action="flip">
        <div class="lab">Question</div>
        <div class="front">${esc(card.front)}</div>
      </div>
      <div class="flip-hint">Tap the card to reveal the answer</div>
    </div>`;
}

function revealCard() {
  const { card } = queue[qIdx];
  const fc = app.querySelector(".flashcard");
  fc.removeAttribute("data-action");
  fc.innerHTML = `<div class="lab">Question</div><div class="front">${esc(card.front)}</div>
    <div class="rule"></div><div class="back">${esc(card.back || "—")}</div>`;
  const hint = app.querySelector(".flip-hint");
  hint.outerHTML = `<div class="grades">
      <button class="grade again" data-action="grade" data-g="0"><span class="g">Again</span><span class="iv">${gradePreview(card, 0, queue[qIdx].examDate)}d</span></button>
      <button class="grade" data-action="grade" data-g="3"><span class="g">Hard</span><span class="iv">${gradePreview(card, 3, queue[qIdx].examDate)}d</span></button>
      <button class="grade good" data-action="grade" data-g="4"><span class="g">Good</span><span class="iv">${gradePreview(card, 4, queue[qIdx].examDate)}d</span></button>
      <button class="grade good" data-action="grade" data-g="5"><span class="g">Easy</span><span class="iv">${gradePreview(card, 5, queue[qIdx].examDate)}d</span></button>
    </div>
    <button class="btn btn-ghost btn-block" data-action="apply-card" style="margin-top:10px">🎯 Apply it — fresh scenario</button>`;
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
  qIdx++;
  paintReviewCard();
}

// --- Apply step: a fresh hypothetical per concept, then typed grading --------
let applyState = null; // { item, hypothetical, phase }

async function startApply() {
  const item = queue[qIdx];
  if (!item || !item.card.back) return paintReviewCard();
  applyState = { item, phase: "loading" };
  app.innerHTML = `
    <div class="rev-top">${XBTN}<div class="bar"><i style="width:${Math.round((qIdx / queue.length) * 100)}%"></i></div>
      <span class="rev-count tnum">${qIdx + 1} / ${queue.length}</span></div>
    <div class="rev-body">
      <div class="t-label">Apply it</div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
        <span class="spinner" style="border-color:var(--border);border-top-color:var(--primary)"></span>
        <span style="font-size:13px;color:var(--muted)">Writing a fresh scenario…</span>
      </div>
    </div>`;
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
  app.innerHTML = `
    <div class="rev-top">${XBTN}<div class="bar"><i style="width:${Math.round((qIdx / queue.length) * 100)}%"></i></div>
      <span class="rev-count tnum">${qIdx + 1} / ${queue.length}</span></div>
    <div class="rev-body">
      <div class="t-label">Apply it — new scenario</div>
      <div class="hypothetical">${esc(hypothetical.scenario)}</div>
      <textarea id="applyAnswer" class="sa-input" rows="4" placeholder="Type your answer…"></textarea>
      <button class="btn btn-primary btn-block" data-action="apply-check">Check answer</button>
    </div>`;
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
  box.innerHTML = `
    <div class="score-row">
      <div class="score tnum ${grading.correct ? "ok" : "no"}">${grading.score}</div>
      <div><b style="color:${grading.correct ? "var(--success)" : "var(--danger)"}">${grading.correct ? "Correct" : "Needs work"}</b>
        <div class="feedback">${esc(grading.feedback)}</div></div>
    </div>
    <button class="btn btn-primary btn-block" data-action="${nextAction}">Continue</button>`;
  const body = app.querySelector(".rev-body");
  if (body) {
    body.querySelector(".sa-input")?.remove();
    body.querySelector('[data-action="apply-check"]')?.remove();
    body.querySelector('[data-action="typed-check"]')?.remove();
    body.appendChild(box);
  }
}

// --- Typed-answer practice over a set's cards (AI assessment) ---------------
let typedState = null; // { sessionId, items, idx }

async function startTypedPractice(sessionId) {
  const { studySets } = await bundle();
  const set = setFor(sessionId, studySets);
  const cards = (set?.flashcards || []).filter((c) => c.back);
  if (!cards.length) return toast("No cards to practice.");
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
    app.innerHTML = `
      <div class="view">
        <div class="done-msg"><div class="big">✍️</div>
          <div style="font-weight:650;color:var(--ink)">Practice complete</div>
          <div style="margin-top:4px">${items.length} typed answer${items.length === 1 ? "" : "s"} graded.</div>
        </div>
        <button class="btn btn-primary btn-block" data-action="return-focus">Done</button>
      </div>`;
    return;
  }
  const { card } = items[idx];
  app.innerHTML = `
    <div class="rev-top">${XBTN}<div class="bar"><i style="width:${Math.round((idx / items.length) * 100)}%"></i></div>
      <span class="rev-count tnum">${idx + 1} / ${items.length}</span></div>
    <div class="rev-body">
      <div class="t-label">Type the answer</div>
      <div style="font-size:16px;font-weight:600;line-height:1.35">${esc(card.front)}</div>
      <textarea id="typedAnswer" class="sa-input" rows="3" placeholder="Answer in your own words…"></textarea>
      <button class="btn btn-primary btn-block" data-action="typed-check">Check answer</button>
      <div class="help" style="margin:0;text-align:center">AI-graded against this card's answer.</div>
    </div>`;
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

function paintReviewDone() {
  showChrome(false);
  app.innerHTML = `
    <div class="view">
      <div class="done-msg"><div class="big">🎉</div>
        <div style="font-weight:650;color:var(--ink)">Review complete</div>
        <div style="margin-top:4px">${queue.length} card${queue.length === 1 ? "" : "s"} reviewed.</div>
      </div>
      <button class="btn btn-primary btn-block" data-action="return-focus">Done</button>
    </div>`;
  syncNow().catch(() => {}); // push grades + pull changes after a session
}

// ================================================================ QUIZ (focus)
let quizSet = null,
  quizIdx = 0,
  quizScore = 0;

function startQuiz(studySet, ret) {
  quizSet = studySet;
  quizIdx = 0;
  quizScore = 0;
  focusReturn = ret;
  showChrome(false);
  paintQuizQ();
}

function paintQuizQ() {
  if (quizIdx >= quizSet.quiz.length) return paintQuizDone();
  const q = quizSet.quiz[quizIdx];
  app.innerHTML = `
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
    </div>`;
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
  ex.innerHTML = `<b style="color:${i === q.answer ? "var(--success)" : "var(--danger)"}">${
    i === q.answer ? "Correct." : "Not quite."
  }</b> ${esc(q.explain || "")}`;
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
  app.innerHTML = `
    <div class="view">
      <div class="done-msg"><div class="big">${pct >= 80 ? "🌟" : pct >= 50 ? "👍" : "📖"}</div>
        <div style="font-size:30px;font-weight:750;color:var(--ink)" class="tnum">${quizScore}/${quizSet.quiz.length}</div>
        <div style="margin-top:4px">${pct}% correct</div>
      </div>
      <button class="btn btn-primary btn-block" data-action="return-focus">Done</button>
    </div>`;
}

// ================================================================ IMPORT
function unescapeSep(v) {
  return v.replace(/\\t/g, "\t").replace(/\\n/g, "\n");
}
function parseCards(text, termRaw, cardRaw) {
  const termSep = unescapeSep(termRaw);
  const cardSep = unescapeSep(cardRaw);
  let rows;
  if (cardSep === "\n\n") rows = text.split(/\r?\n\s*\r?\n/);
  else if (cardSep === "\n") rows = text.split(/\r?\n/);
  else rows = text.split(cardSep);
  const cards = [];
  for (let row of rows) {
    row = row.trim();
    if (!row) continue;
    const i = row.indexOf(termSep);
    const front = i === -1 ? row : row.slice(0, i).trim();
    const back = i === -1 ? "" : row.slice(i + termSep.length).trim();
    if (front) cards.push({ front, back });
  }
  return cards;
}
const importCards = () =>
  parseCards(document.getElementById("importText").value, document.getElementById("termSep").value, document.getElementById("cardSep").value);

function renderImport() {
  showChrome(false);
  app.innerHTML = `
    <div class="view">
      <div class="ahd">
        <button class="iconbtn" data-action="nav-home" aria-label="Back"><svg class="ic" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>
        <div class="h-title" style="font-size:16px">Import flashcards</div><span style="width:32px"></span>
      </div>
      <div class="help"><b>From Quizlet:</b> open a set page and click the floating <b>Import to Mafsar</b> button, or export (⋯ → Export, Tab + New line) and paste below. Works for CSV/TSV too.</div>
      <div class="field"><label>Title</label><input id="importTitle" type="text" placeholder="e.g. Biology — Chapter 3" /></div>
      <div class="sep-row">
        <div class="field"><label>Term / definition</label>
          <select id="termSep"><option value="\\t">Tab</option><option value=",">Comma</option><option value=" - ">Dash</option><option value="|">Pipe</option></select></div>
        <div class="field"><label>Between cards</label>
          <select id="cardSep"><option value="\\n">New line</option><option value="\\n\\n">Blank line</option><option value=";">Semicolon</option></select></div>
      </div>
      <div class="field"><label>Pasted content</label><textarea id="importText" rows="7" placeholder="term&#9;definition"></textarea></div>
      <div class="preview" id="importPreview"></div>
      <div style="display:flex;gap:10px">
        <button class="btn btn-ghost" style="flex:1" data-action="import-preview">Preview</button>
        <button class="btn btn-primary" style="flex:1" data-action="import-save">Import</button>
      </div>
    </div>`;
}
function previewImport() {
  const cards = importCards();
  const box = document.getElementById("importPreview");
  if (!cards.length) {
    box.innerHTML = '<div class="empty">No cards detected — try a different separator.</div>';
    return;
  }
  box.innerHTML =
    `<div style="font-size:12.5px;color:var(--muted);margin-bottom:8px">${cards.length} card(s) detected</div>` +
    cards
      .slice(0, 3)
      .map((c) => `<div class="pv-card"><b>${esc(c.front)}</b><span>${esc(c.back)}</span></div>`)
      .join("");
}
async function doImport() {
  const cards = importCards();
  if (!cards.length) return toast("Nothing to import — check separators.");
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

// ================================================================ TEAMS / YOU (placeholders)
function renderTeams() {
  setNav("teams");
  showChrome(true);
  app.innerHTML = `
    <div class="view">
      <div class="ahd"><div class="h-title">Team learning</div></div>
      <div class="block tint" style="text-align:center;padding:22px 16px">
        <div style="font-size:26px">👥</div>
        <div style="font-weight:650;margin-top:8px">Study together — coming soon</div>
        <div style="font-size:12.5px;color:var(--muted);margin-top:6px;line-height:1.55">
          Shared sets, team progress, and streak boards arrive with cloud sync. They need an account so
          your sets can follow you across devices.</div>
      </div>
      <button class="btn btn-ghost btn-block" disabled>Create a team</button>
    </div>`;
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
               auth.lastSync ? "Last synced " + new Date(auth.lastSync).toLocaleString() : "Never synced"
             }</div>
           </div>
         </div>
         <div style="display:flex;gap:10px">
           <button class="btn btn-primary" style="flex:1" data-action="sync-now">⟳ Sync now</button>
           <button class="btn btn-ghost" style="flex:1" data-action="auth-signout">Sign out</button>
         </div>
       </div>`
    : `<div class="block" style="display:flex;flex-direction:column;gap:10px">
         <div style="font-weight:600;font-size:13px">Cloud sync</div>
         <div style="font-size:12px;color:var(--muted);line-height:1.5">Sign in to sync your sets across devices. Everything works offline without an account.</div>
         <div class="field"><label>Email</label><input id="youEmail" type="email" placeholder="you@example.com" autocomplete="email" /></div>
         <div class="field"><label>Password</label><input id="youPass" type="password" placeholder="8+ characters" autocomplete="new-password" /></div>
         <div style="display:flex;gap:10px">
           <button class="btn btn-primary" style="flex:1" data-action="auth-signin">Sign in</button>
           <button class="btn btn-ghost" style="flex:1" data-action="auth-register">Create account</button>
         </div>
       </div>`;

  app.innerHTML = `
    <div class="view">
      <div class="ahd"><div class="wordmark">Maf<b>sar</b></div></div>
      <div class="block" style="text-align:center;padding:20px">
        <div style="font-size:13px;color:var(--muted)">${auth?.user ? "Syncing to the cloud" : "Studying locally on this device"}</div>
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
      <button class="btn btn-ghost btn-block" data-action="settings">Settings · reminders</button>
      <div class="listhd"><span class="t-label">Backup</span></div>
      <div style="display:flex;gap:10px">
        <button class="btn btn-ghost" style="flex:1" data-action="export-backup">⇩ Export JSON</button>
        <button class="btn btn-ghost" style="flex:1" data-action="import-backup">⇪ Restore</button>
      </div>
      <input type="file" id="backupFile" accept="application/json,.json" class="hidden" />
    </div>`;
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
    toast(`Signed in as ${user.email} — syncing…`);
    try {
      const r = await syncNow();
      if (!r.skipped) toast(`Synced · ${r.pulled} item(s) from cloud`);
    } catch { /* offline is fine */ }
    // From the first-launch gate go Home; from the You tab stay on You.
    wasSignedIn ? renderYou() : renderHome();
  } catch (e) {
    toast(e.message);
  }
}

async function manualSync() {
  toast("Syncing…");
  try {
    const r = await syncNow();
    if (r.skipped) return toast("Sign in to sync.");
    toast(r.pulled || r.pushed ? `Synced · ${r.pushed} up, ${r.pulled} down` : "Up to date");
    renderHome();
  } catch (e) {
    toast(e.message);
    renderYou();
  }
}

// ================================================================ capture current tab
async function captureCurrent() {
  toast("Capturing…");
  const tab = await queryActiveTab();
  if (!tab?.id) return toast("No active tab.");
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
    if (r.generated) toast(`Saved · ${r.cards} cards generated`);
    else toast("Saved — generation failed; open the set to retry");
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
    case "settings": chrome.runtime.openOptionsPage(); break;
    case "open-import": renderImport(); break;
    case "nav-home": renderHome(); break;
    case "nav-sets": renderSets(); break;
    case "open-set": renderSetDetail(id); break;
    case "make-set": makeSet(id); break;
    case "capture-current": captureCurrent(); break;
    case "tab": renderSetDetail(detail.session.id, t.dataset.tab); break;
    case "delete-set":
      if (confirm("Delete this set and its cards?")) deleteSession(id).then(renderHome);
      break;
    case "start-review": startGlobalReview(); break;
    case "set-review": startSetReview(id); break;
    case "flip": revealCard(); break;
    case "grade": gradeCard(Number(t.dataset.g)); break;
    case "apply-card": startApply(); break;
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
    case "export-tsv": exportSetTsv(id); break;
    case "gen-summary": generateSummary(id); break;
    case "export-backup": exportBackup(); break;
    case "import-backup": document.getElementById("backupFile")?.click(); break;
    case "auth-signin": authSubmit("login"); break;
    case "auth-register": authSubmit("register"); break;
    case "auth-signout":
      logout().then(() => {
        toast("Signed out — data stays on this device");
        renderYou();
      });
      break;
    case "sync-now": manualSync(); break;
    case "start-quiz": startQuiz(detail.studySet, "set:" + detail.session.id); break;
    case "quiz-opt": answerQuiz(Number(t.dataset.i)); break;
    case "quiz-next": quizIdx++; paintQuizQ(); break;
    case "import-preview": previewImport(); break;
    case "import-save": doImport(); break;
    case "close-focus":
    case "return-focus": goReturn(); break;
  }
});

function goReturn() {
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
  if (!items.length) return toast("Nothing due right now 🎉");
  startReview(items, "home");
}
async function startSetReview(sessionId) {
  const { studySets } = await bundle();
  const set = setFor(sessionId, studySets);
  const items = (set?.flashcards || []).filter((c) => isDue(c)).map((card) => ({ sessionId, card, examDate: set.examDate }));
  items.sort((a, b) => byDue(a.card, b.card));
  if (!items.length) return toast("Nothing due in this set.");
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
  if (btn) btn.closest("div").insertAdjacentHTML("beforebegin", html);
}
async function saveNewCard(sessionId) {
  const front = document.getElementById("newFront")?.value.trim();
  const back = document.getElementById("newBack")?.value.trim();
  if (!front) return toast("The front is required.");
  await addCard(sessionId, front, back || "");
  toast("Card added");
  renderSetDetail(sessionId, "cards");
}
async function saveCardEdit(sessionId, cardId) {
  const front = document.getElementById("editFront")?.value.trim();
  const back = document.getElementById("editBack")?.value.trim();
  if (!front) return toast("The front is required.");
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
  if (!set?.flashcards?.length) return toast("No cards to export.");
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
      toast(ms ? "Exam date set — cards will resurface before it" : "Exam date cleared");
      renderSetDetail(t.dataset.session, "cards");
    });
  } else if (t.id === "backupFile" && t.files?.[0]) {
    importBackupFile(t.files[0]);
    t.value = "";
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
  app.innerHTML = `
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
    </div>`;
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
