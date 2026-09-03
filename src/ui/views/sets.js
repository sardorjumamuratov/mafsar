import { app, bundle, isAIChatTab, esc, send, setFor, setHTML, sourceLabel, summarize, toast, topOfView } from "../core.js";
import { setNav, showChrome } from "../nav.js";
import { parseShareCode } from ".././share-link.js";
import { setSharedPreview, sharedPreview } from "../views/teams.js";
import { addSession, saveStudySet, uid } from "../../storage/store.js";
import { initSchedule } from "../../storage/srs.js";
import { syncNow } from "../../sync/sync.js";
import { renderSetDetail } from "../views/set-detail.js";

export function setRow(session, s) {
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

let captureAnswerToken = 0;

export async function refreshCaptureAnswerButton() {
  const btn = document.getElementById("captureAnswerBtn");
  if (!btn) return;
  
  const token = Math.random();
  captureAnswerToken = token;
  
  const chatTab = await isAIChatTab();
  if (captureAnswerToken !== token) return; // stale response
  
  btn.classList.toggle("hidden", !chatTab.ok);
  if (chatTab.url) {
    btn.dataset.origin = new URL(chatTab.url).origin;
  } else {
    delete btn.dataset.origin;
  }
}

// ================================================================ SETS
export async function renderSets() {
  setNav("sets");
  showChrome(true);
  const { sessions, studySets } = await bundle();
  // The capture button starts hidden and is revealed after paint by
  // refreshCaptureAnswerButton(). Awaiting isAIChatTab here used to block the
  // whole list for up to 2s on a tab whose content script never answers.

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
      <button class="btn btn-ghost btn-block hidden" id="captureAnswerBtn" data-action="capture-last-answer">✨ Capture last answer</button>
      <button class="btn btn-ghost btn-block" data-action="capture-current">＋ Capture this page</button>
    </div>`);
  topOfView();
  refreshCaptureAnswerButton().catch(() => {});
}

export async function lookupShare() {
  const code = parseShareCode(/** @type {HTMLInputElement} */ (document.getElementById("shareCode"))?.value || "");
  if (!code) return toast("Enter a code first.");
  const out = document.getElementById("sharePreview");
  if (out) setHTML(out, '<div style="font-size:13px;color:var(--muted)">Looking up…</div>');
  try {
    const payload = await send({ type: "SHARE_FETCH", code });
    // Already added? Sessions keep the code they imported with, so a re-entry
    // is caught before a duplicate set appears.
    const { sessions } = await bundle();
    if (sessions.some((s) => s.shareCode === code)) {
      setSharedPreview(null);
      if (out) setHTML(out, "");
      return toast("You already added this set.");
    }
    setSharedPreview({ code, ...payload });
    paintSharePreview(out);
  } catch (e) {
    setSharedPreview(null);
    if (out) setHTML(out, "");
    // The server words revoked and unknown the same way on purpose; offline
    // reads differently because the fix is different.
    if (/fetch|network|Failed/i.test(e.message)) toast("Can't reach the server — check your connection.");
    else if (/Unknown or revoked/i.test(e.message)) toast("That code isn't valid — revoked, or check for typos.");
    else toast(e.message);
  }
}

export function paintSharePreview(out) {
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

export async function importSharedSet() {
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
  setSharedPreview(null);
  renderSetDetail(session.id, "cards");
}

