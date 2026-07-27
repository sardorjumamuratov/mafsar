import {
  getSettings,
  getSessions,
  addSession,
  deleteSession,
  getStudySetForSession,
  saveStudySet,
  updateCard,
  uid,
} from "../storage/store.js";
import { initSchedule, review, isDue, byDue } from "../storage/srs.js";

const $ = (sel) => document.querySelector(sel);

// --- helpers ----------------------------------------------------------------

function toast(msg, ms = 2400) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add("hidden"), ms);
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
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

// Callback-wrapped tab helpers — the callback form works in both Chrome and
// Firefox (Firefox's chrome.* namespace doesn't return promises).
function queryActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs && tabs[0]));
  });
}

function sendToTab(tabId, msg) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, msg, (resp) => {
      if (chrome.runtime.lastError) return resolve(null);
      resolve(resp);
    });
  });
}

function show(view) {
  $("#listView").classList.toggle("hidden", view !== "list");
  $("#studyView").classList.toggle("hidden", view !== "study");
  $("#importView").classList.toggle("hidden", view !== "import");
}

// --- settings / warning -----------------------------------------------------

async function refreshApiWarning() {
  const s = await getSettings();
  $("#apiWarning").classList.toggle("hidden", !!s.apiKey);
}

// --- session list -----------------------------------------------------------

async function renderList() {
  const sessions = await getSessions();
  const container = $("#sessions");
  container.innerHTML = "";
  $("#emptyState").classList.toggle("hidden", sessions.length > 0);

  for (const sess of sessions) {
    const set = await getStudySetForSession(sess.id);
    const el = document.createElement("div");
    el.className = "session";
    el.innerHTML = `
      <div class="title"></div>
      <div class="meta">
        <span class="pill"></span>
        <span class="ago"></span>
        <span class="count"></span>
      </div>
      <div class="actions">
        <button class="go"></button>
        <button class="danger">Delete</button>
      </div>`;
    el.querySelector(".title").textContent = sess.title || "Untitled conversation";
    el.querySelector(".pill").textContent = sess.sourceLabel || sess.source || "chat";
    el.querySelector(".ago").textContent = timeAgo(sess.capturedAt);
    const isImport = sess.source === "quizlet" || !sess.messages?.length;
    el.querySelector(".count").textContent = isImport
      ? `${sess.importedCount ?? set?.flashcards?.length ?? 0} cards`
      : `${sess.messages.length} msgs`;
    el.querySelector(".go").textContent = set ? "Study" : "Make study set";
    el.querySelector(".go").addEventListener("click", (e) => {
      e.stopPropagation();
      openStudy(sess.id, !set);
    });
    el.querySelector(".danger").addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm("Delete this session and its study set?")) return;
      await deleteSession(sess.id);
      renderList();
    });
    el.addEventListener("click", () => openStudy(sess.id, !set));
    container.appendChild(el);
  }
}

// --- capture current tab ----------------------------------------------------

async function captureCurrent() {
  const btn = $("#captureBtn");
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = "Capturing…";
  try {
    const tab = await queryActiveTab();
    if (!tab?.id) throw new Error("No active tab.");
    const resp = await sendToTab(tab.id, { type: "CAPTURE_ACTIVE" });
    if (!resp) {
      throw new Error("Open a ChatGPT, Claude, or Gemini conversation tab first.");
    }
    if (!resp.ok) throw new Error(resp.error || "Nothing to capture.");
    await addSession(resp.session);
    toast(`Saved “${resp.session.title}” (${resp.session.messages.length} msgs)`);
    await renderList();
  } catch (err) {
    toast(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

// --- study set detail -------------------------------------------------------

let current = null; // { sessionId, studySet }

async function openStudy(sessionId, needsGenerate) {
  show("study");
  $("#studyTitle").textContent = "Loading…";
  $("#cardsTab").innerHTML = "";
  $("#quizTab").innerHTML = "";

  let studySet = await getStudySetForSession(sessionId);

  if (!studySet && needsGenerate) {
    const settings = await getSettings();
    if (!settings.apiKey) {
      $("#studyTitle").textContent = "Study set";
      $("#cardsTab").innerHTML =
        '<p class="done-msg">Add your Anthropic API key in settings to generate study material.</p>';
      return;
    }
    $("#studyTitle").innerHTML = '<span class="spinner"></span>Generating…';
    $("#cardsTab").innerHTML =
      '<p class="done-msg">Generating flashcards & quiz from your conversation…</p>';
    try {
      const resp = await send({ type: "GENERATE_STUDY_SET", sessionId });
      studySet = resp.studySet;
      toast("Study set ready!");
    } catch (err) {
      $("#studyTitle").textContent = "Study set";
      $("#cardsTab").innerHTML = `<p class="done-msg">Generation failed: ${err.message}</p>`;
      return;
    }
  }

  if (!studySet) {
    $("#studyTitle").textContent = "Study set";
    $("#cardsTab").innerHTML = '<p class="done-msg">No study set yet.</p>';
    return;
  }

  current = { sessionId, studySet };
  $("#studyTitle").textContent = studySet.title || "Study set";
  switchTab("cards");
  renderCards();
  renderQuiz();
}

// --- flashcard review (SM-2) ------------------------------------------------

function renderCards() {
  const panel = $("#cardsTab");
  const cards = current.studySet.flashcards || [];
  const due = cards.filter((c) => isDue(c)).sort(byDue);

  if (!cards.length) {
    panel.innerHTML = '<p class="done-msg">No flashcards in this set.</p>';
    return;
  }
  if (!due.length) {
    const next = [...cards].sort(byDue)[0];
    const when = next ? timeAgoFuture(next.dueDate) : "";
    panel.innerHTML = `<p class="done-msg">✅ All caught up!<br><small>Next review ${when}.</small></p>`;
    return;
  }
  reviewCard(due, 0);
}

function timeAgoFuture(ts) {
  const s = Math.floor((ts - Date.now()) / 1000);
  if (s <= 0) return "now";
  const h = Math.floor(s / 3600);
  if (h < 24) return `in ${Math.max(1, h)}h`;
  return `in ${Math.floor(h / 24)}d`;
}

function reviewCard(queue, idx) {
  const panel = $("#cardsTab");
  if (idx >= queue.length) {
    renderCards();
    return;
  }
  const card = queue[idx];
  let flipped = false;

  panel.innerHTML = `
    <div class="progress">Card ${idx + 1} of ${queue.length} due</div>
    <div class="flashcard"><div class="front"></div></div>
    <div class="grade-row hidden">
      <button class="again" data-g="0">Again</button>
      <button data-g="3">Hard</button>
      <button class="good" data-g="4">Good</button>
      <button class="good" data-g="5">Easy</button>
    </div>
    <p class="progress flip-hint">Tap card to reveal answer</p>`;

  const cardEl = panel.querySelector(".flashcard");
  cardEl.querySelector(".front").textContent = card.front;

  cardEl.addEventListener("click", () => {
    if (flipped) return;
    flipped = true;
    cardEl.innerHTML = `<div><div class="front"></div><hr style="opacity:.2;margin:12px 0"><div class="back"></div></div>`;
    cardEl.querySelector(".front").textContent = card.front;
    cardEl.querySelector(".back").textContent = card.back;
    panel.querySelector(".grade-row").classList.remove("hidden");
    panel.querySelector(".flip-hint").classList.add("hidden");
  });

  panel.querySelectorAll(".grade-row button").forEach((b) => {
    b.addEventListener("click", async () => {
      const grade = Number(b.dataset.g);
      const updated = review(card, grade);
      Object.assign(card, updated);
      await updateCard(current.sessionId, card.id, updated);
      reviewCard(queue, idx + 1);
    });
  });
}

// --- quiz -------------------------------------------------------------------

function renderQuiz() {
  const panel = $("#quizTab");
  const quiz = current.studySet.quiz || [];
  panel.innerHTML = "";
  if (!quiz.length) {
    panel.innerHTML = '<p class="done-msg">No quiz questions in this set.</p>';
    return;
  }
  quiz.forEach((q, qi) => {
    const wrap = document.createElement("div");
    wrap.className = "quiz-q";
    const qEl = document.createElement("div");
    qEl.className = "qtext";
    qEl.textContent = `${qi + 1}. ${q.q}`;
    wrap.appendChild(qEl);

    const explain = document.createElement("div");
    explain.className = "explain hidden";
    explain.textContent = q.explain;

    q.options.forEach((opt, oi) => {
      const btn = document.createElement("button");
      btn.className = "opt";
      btn.textContent = opt;
      btn.addEventListener("click", () => {
        const buttons = wrap.querySelectorAll(".opt");
        buttons.forEach((b, bi) => {
          b.disabled = true;
          if (bi === q.answer) b.classList.add("correct");
        });
        if (oi !== q.answer) btn.classList.add("wrong");
        if (q.explain) explain.classList.remove("hidden");
      });
      wrap.appendChild(btn);
    });
    wrap.appendChild(explain);
    panel.appendChild(wrap);
  });
}

// --- import flashcards (Quizlet / CSV / TSV) --------------------------------

// <select> option values store escaped sequences ("\t", "\n") as literal text;
// turn them into real control characters here.
function unescapeSep(v) {
  return v.replace(/\\t/g, "\t").replace(/\\n/g, "\n");
}

function parseCards(text, termSepRaw, cardSepRaw) {
  const termSep = unescapeSep(termSepRaw);
  const cardSep = unescapeSep(cardSepRaw);

  let rows;
  if (cardSep === "\n\n") rows = text.split(/\r?\n\s*\r?\n/);
  else if (cardSep === "\n") rows = text.split(/\r?\n/);
  else rows = text.split(cardSep);

  const cards = [];
  for (let row of rows) {
    row = row.trim();
    if (!row) continue;
    const i = row.indexOf(termSep);
    let front, back;
    if (i === -1) {
      front = row;
      back = "";
    } else {
      front = row.slice(0, i).trim();
      back = row.slice(i + termSep.length).trim();
    }
    if (!front) continue;
    cards.push({ front, back });
  }
  return cards;
}

function currentImportCards() {
  return parseCards($("#importText").value, $("#termSep").value, $("#cardSep").value);
}

function previewImport() {
  const cards = currentImportCards();
  const box = $("#importPreview");
  if (!cards.length) {
    box.innerHTML = '<p class="empty">No cards detected — try a different separator.</p>';
    return;
  }
  box.innerHTML = `<p>${cards.length} card(s) detected. First few:</p>`;
  cards.slice(0, 3).forEach((c) => {
    const div = document.createElement("div");
    div.className = "pv-card";
    const b = document.createElement("b");
    b.textContent = c.front; // textContent — never inject pasted HTML
    const s = document.createElement("span");
    s.textContent = c.back;
    div.append(b, s);
    box.appendChild(div);
  });
}

async function doImport() {
  const cards = currentImportCards();
  if (!cards.length) {
    toast("Nothing to import — check your separators.");
    return;
  }
  const title = $("#importTitle").value.trim() || "Imported flashcards";
  const now = Date.now();
  const flashcards = cards.map((c) => ({
    id: uid(),
    front: c.front,
    back: c.back,
    ...initSchedule(now),
  }));

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

  // reset the form
  $("#importTitle").value = "";
  $("#importText").value = "";
  $("#importPreview").innerHTML = "";

  toast(`Imported ${flashcards.length} cards`);
  show("list");
  renderList();
}

// --- tabs -------------------------------------------------------------------

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((t) =>
    t.classList.toggle("active", t.dataset.tab === name)
  );
  $("#cardsTab").classList.toggle("hidden", name !== "cards");
  $("#quizTab").classList.toggle("hidden", name !== "quiz");
}

// --- wiring -----------------------------------------------------------------

document.querySelectorAll(".tab").forEach((t) =>
  t.addEventListener("click", () => switchTab(t.dataset.tab))
);
$("#captureBtn").addEventListener("click", captureCurrent);
$("#importBtn").addEventListener("click", () => show("import"));
$("#importBackBtn").addEventListener("click", () => {
  show("list");
  renderList();
});
$("#importPreviewBtn").addEventListener("click", previewImport);
$("#importSaveBtn").addEventListener("click", doImport);
$("#backBtn").addEventListener("click", () => {
  show("list");
  renderList();
});
$("#settingsBtn").addEventListener("click", () => chrome.runtime.openOptionsPage());
$("#openOptions").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// init
show("list");
refreshApiWarning();
renderList();
