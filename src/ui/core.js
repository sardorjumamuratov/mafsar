import { getActivity, getReviewLog, getSessions, getSettings, getStudySets } from "../storage/store.js";
import { isDue, masteryOf } from "../storage/srs.js";

export const app = document.getElementById("app");
export const nav = document.getElementById("bottomNav");

// ---------------------------------------------------------------- helpers
export const esc = (s) =>
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
export function fragment(html) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const frag = document.createDocumentFragment();
  frag.append(...parsed.body.childNodes);
  return frag;
}
/** Replace an element's children with parsed HTML (was: el.DOM-HTML = …). */
export function setHTML(el, html) {
  el.replaceChildren(fragment(html));
}
/**
 * New *view* renders call this to start at the title — #app keeps its scroll
 * offset across setHTML. In-place repaints (grading, flipping, editing a card)
 * must NOT call it: the user's position is part of that interaction.
 */
export function topOfView() {
  app.scrollTop = 0;
}
/** Replace the element itself with parsed HTML (was: el.DOM-OUTER = …). */
export function replaceHTML(el, html) {
  el.replaceWith(fragment(html));
}
/** Insert parsed HTML immediately before an element. */
export function insertHTMLBefore(el, html) {
  el.parentNode.insertBefore(fragment(html), el);
}

export const FLAME =
  '<svg viewBox="0 0 24 24"><path d="M13 2c.5 3.5-2.5 4.8-2.5 8A2.5 2.5 0 0 0 15 10c0-1-.3-1.8-.7-2.6 2.4 1.2 4.2 3.6 4.2 6.6a6.5 6.5 0 1 1-13 0c0-4.7 4-6.4 7.5-12z"/></svg>';
export const XBTN =
  '<button class="iconbtn" data-action="close-focus" aria-label="Close"><svg class="ic" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
export const GOOGLE_G = `<svg class="gicon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;
export const COPY_SVG =
  '<svg class="ic" viewBox="0 0 24 24"><path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1M8 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M8 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m0 0h2m-2 4h4m-4 4h4"/></svg>';

/**
 * Show a message. `ms <= 0` keeps it up indefinitely — use that for work whose
 * duration you cannot predict (a capture waits on an LLM call), and replace it
 * with a normal toast when the work finishes. Every sticky toast MUST have a
 * guaranteed replacement on all paths, or it stays on screen forever.
 */
export function toast(msg, ms = 2600) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  (/** @type {any} */ (t)).classList.remove("hidden");
  clearTimeout((/** @type {any} */ (toast))._t);
  if (ms > 0) {
    (/** @type {any} */ (toast))._t = setTimeout(() => (/** @type {any} */ (t)).classList.add("hidden"), ms);
  }
}

export function send(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (resp) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!resp || !resp.ok) return reject(new Error(resp?.error || "Request failed"));
      resolve(resp);
    });
  });
}
export function queryActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs && tabs[0]));
  });
}
/**
 * Ask a tab something, resolving `null` if it has no listener, errors, or never
 * answers within `timeoutMs`.
 *
 * The timeout is load-bearing. Every content script here ends its onMessage
 * handler with `return true`, which promises an async reply — so a script that
 * has no branch for this message type never calls sendResponse and the
 * callback never fires. Without a deadline, isAIChatTab() would await forever
 * against an older content script left in an open tab, and renderSets() would
 * never finish painting: a permanently blank Sets view.
 */
export function sendToTab(tabId, msg, timeoutMs = 2000) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    const timer = setTimeout(() => done(null), timeoutMs);
    try {
      chrome.tabs.sendMessage(tabId, msg, (resp) => {
        clearTimeout(timer);
        done(chrome.runtime.lastError ? null : resp);
      });
    } catch {
      clearTimeout(timer);
      done(null);
    }
  });
}

import { AI_CHAT_HOSTS } from "./ai-hosts.js";

/**
 * Known AI-chat hostnames. Checked purely by URL — no messaging needed, so
 * detection works even before any content script loads. The list is broader
 * than the adapter list on purpose: the generic extractor handles the rest.
 */
export async function isAIChatTab() {
  const tab = await queryActiveTab();
  if (!tab?.id) return { ok: false };
  
  if (tab.url) {
    try {
      const host = new URL(tab.url).hostname;
      if (AI_CHAT_HOSTS.some((h) => host === h || host.endsWith("." + h))) {
        return { ok: true, url: tab.url };
      }
    } catch {
      return { ok: false };
    }
  }

  // Without host permissions, URL is hidden. Fall back to pinging the 
  // content scripts we *do* have explicit host_permissions for.
  const resp = await sendToTab(tab.id, { type: "MAFSAR_PING" });
  if (resp?.ok) return { ok: true, url: null };

  return { ok: false };
}

export function timeUntil(ts) {
  const s = Math.floor((ts - Date.now()) / 1000);
  if (s <= 0) return "now";
  const h = Math.floor(s / 3600);
  if (h < 1) return "soon";
  if (h < 24) return `in ${h}h`;
  return `in ${Math.round(h / 24)}d`;
}
export function examDaysLeft(examDate) {
  const d = Math.ceil((examDate - Date.now()) / 86400000);
  if (d < 0) return "Exam passed";
  if (d === 0) return "Today's the day";
  return `${d} day${d === 1 ? "" : "s"} to go`;
}
export function dateInputValue(examDate) {
  // yyyy-mm-dd for <input type="date">, local time.
  if (!examDate) return "";
  const d = new Date(examDate);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
export function sourceLabel(session) {
  return (
    session.sourceLabel ||
    { chatgpt: "ChatGPT", claude: "Claude", gemini: "Gemini", quizlet: "Quizlet", shared: "Shared" }[session.source] ||
    "Chat"
  );
}

// ---------------------------------------------------------------- data
export async function bundle() {
  const [sessions, studySets, activity, settings, reviewLog] = await Promise.all([
    getSessions(),
    getStudySets(),
    getActivity(),
    getSettings(),
    getReviewLog(),
  ]);
  return { sessions, studySets, activity, settings, reviewLog };
}
export const setFor = (sessionId, studySets) => studySets.find((s) => s.sessionId === sessionId) || null;

export function summarize(studySet) {
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
