import {
  getSettings,
  getSessions,
  addSession,
  deleteSession,
  getStudySets,
  saveStudySet,
  updateCard,
  getActivity,
  bumpActivity,
  computeStreak,
  weekActivity,
  dayKey,
  uid,
} from "../storage/store.js";
import { initSchedule, review, isDue, byDue, masteryOf } from "../storage/srs.js";

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
  const [sessions, studySets, activity, settings] = await Promise.all([
    getSessions(),
    getStudySets(),
    getActivity(),
    getSettings(),
  ]);
  return { sessions, studySets, activity, settings };
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
  const { sessions, studySets, activity, settings } = await bundle();

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

  const keyBanner =
    !settings.apiKey && sessions.length
      ? `<div class="help" style="display:flex;justify-content:space-between;align-items:center;gap:10px">
           <span>Add an API key to auto-generate study sets.</span>
           <button class="linkbtn" data-action="settings">Settings</button>
         </div>`
      : "";

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

      ${keyBanner}
      ${heroHtml}

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
      <button class="btn btn-ghost btn-block" data-action="capture-current">＋ Capture current chat</button>
    </div>`;
}

// ================================================================ SET DETAIL
let detail = null; // { session, studySet, summary, tab }

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
        <div class="big">✨</div>This conversation isn't a study set yet.
        <div style="margin-top:14px"><button class="btn btn-primary" data-action="make-set" data-id="${esc(session.id)}">Generate flashcards & quiz</button></div>
      </div>`;
  } else if (tab === "cards") {
    body = `
      <div class="mastery">
        <div class="m new"><div class="v tnum">${s.fresh}</div><div class="k">New</div></div>
        <div class="m learn"><div class="v tnum">${s.learning}</div><div class="k">Learning</div></div>
        <div class="m mast"><div class="v tnum">${s.mastered}</div><div class="k">Mastered</div></div>
      </div>
      <div class="block" style="padding:6px 14px">
        ${
          studySet.flashcards.length
            ? studySet.flashcards
                .map(
                  (c) =>
                    `<div class="cardrow"><span class="sdot ${masteryOf(c)}"></span><span class="q">${esc(c.front)}</span><span class="due">${
                      isDue(c) ? "Due now" : timeUntil(c.dueDate)
                    }</span></div>`
                )
                .join("")
            : '<div class="empty">No flashcards.</div>'
        }
      </div>`;
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
    const points = (studySet.flashcards || []).slice(0, 8);
    body = `
      <div class="block" style="display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <span class="tag dot" style="color:var(--primary)">${esc(sourceLabel(session))}</span>
          <span class="tag">${studySet.flashcards.length} cards</span>
          ${session.messages?.length ? `<span class="tag">${session.messages.length} messages</span>` : ""}
        </div>
        <div class="t-label" style="margin-top:6px">Key points</div>
        <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.6;color:var(--muted)">
          ${points.map((c) => `<li>${esc(c.front)}</li>`).join("") || "<li>No cards</li>"}
        </ul>
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

function gradePreview(card, g) {
  return review(card, g).interval;
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
      <button class="grade again" data-action="grade" data-g="0"><span class="g">Again</span><span class="iv">${gradePreview(card, 0)}d</span></button>
      <button class="grade" data-action="grade" data-g="3"><span class="g">Hard</span><span class="iv">${gradePreview(card, 3)}d</span></button>
      <button class="grade good" data-action="grade" data-g="4"><span class="g">Good</span><span class="iv">${gradePreview(card, 4)}d</span></button>
      <button class="grade good" data-action="grade" data-g="5"><span class="g">Easy</span><span class="iv">${gradePreview(card, 5)}d</span></button>
    </div>`;
}

async function gradeCard(g) {
  const item = queue[qIdx];
  const upd = review(item.card, g);
  Object.assign(item.card, upd);
  await updateCard(item.sessionId, item.card.id, upd);
  await bumpActivity(1);
  qIdx++;
  paintReviewCard();
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
  const provider = { gemini: "Google Gemini", groq: "Groq", anthropic: "Anthropic" }[settings.provider] || settings.provider;

  app.innerHTML = `
    <div class="view">
      <div class="ahd"><div class="wordmark">Maf<b>sar</b></div></div>
      <div class="block" style="text-align:center;padding:20px">
        <div style="font-size:13px;color:var(--muted)">Studying locally on this device</div>
        <div style="display:flex;justify-content:center;gap:8px;margin-top:12px">
          <span class="streak">${FLAME}${streak}-day streak</span>
        </div>
      </div>
      <div class="stats">
        <div class="stat"><div class="v tnum">${mastered}</div><div class="k">Mastered</div></div>
        <div class="stat"><div class="v tnum">${total}</div><div class="k">Cards</div></div>
        <div class="stat"><div class="v tnum">${studySets.length}</div><div class="k">Sets</div></div>
      </div>
      <button class="btn btn-ghost btn-block" data-action="settings">Settings · ${esc(provider)}${settings.apiKey ? "" : " · no key"}</button>
      <div class="block" style="text-align:center">
        <div style="font-weight:600;font-size:13px">Sign in — coming soon</div>
        <div style="font-size:12px;color:var(--muted);margin-top:4px">Accounts will sync your sets across devices and unlock teams.</div>
      </div>
    </div>`;
}

// ================================================================ capture current tab
async function captureCurrent() {
  toast("Capturing…");
  const tab = await queryActiveTab();
  if (!tab?.id) return toast("No active tab.");
  const resp = await sendToTab(tab.id, { type: "CAPTURE_ACTIVE" });
  if (!resp) return toast("Open a ChatGPT, Claude, or Gemini chat first.");
  if (!resp.ok) return toast(resp.error || "Nothing to capture.");
  try {
    const r = await send({ type: "SAVE_AND_GENERATE", payload: resp.session });
    if (r.generated) toast(`Saved · ${r.cards} cards generated`);
    else if (r.reason === "no-key") toast("Saved — add an API key to generate");
    else toast("Saved — generation failed");
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
  studySets.forEach((set) => (set.flashcards || []).forEach((card) => isDue(card) && items.push({ sessionId: set.sessionId, card })));
  items.sort((a, b) => byDue(a.card, b.card));
  if (!items.length) return toast("Nothing due right now 🎉");
  startReview(items, "home");
}
async function startSetReview(sessionId) {
  const { studySets } = await bundle();
  const set = setFor(sessionId, studySets);
  const items = (set?.flashcards || []).filter((c) => isDue(c)).map((card) => ({ sessionId, card }));
  items.sort((a, b) => byDue(a.card, b.card));
  if (!items.length) return toast("Nothing due in this set.");
  startReview(items, "set:" + sessionId);
}
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

// init
renderHome();
