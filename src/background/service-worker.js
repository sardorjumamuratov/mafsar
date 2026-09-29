import { backendGlobalAdd } from "../sync/api.js";
// Background service worker (ES module). Orchestrates capture storage and
// generation through the Mafsar backend (server-side LLM key), and opens the
// side panel when the toolbar icon is clicked.
import "../storage/last-answer.js";

import {
  addSession,
  deleteActiveAccountData,
  getSessions,
  deleteSession,
  getStudySetForSession,
  saveStudySet,
  uid,
} from "../storage/store.js";
import { initSchedule } from "../../shared/srs.js";
import { mergeChains } from "../storage/chains.js";
import {
  backendGenerate,
  backendGrade,
  backendHypothetical,
  backendSummarize,
  backendBlurb,
  backendBillingCheckout,
  backendBillingPortal,
  backendShareCreate,
  backendShareFetch,
  backendShareRevoke,
  backendTeamCreate,
  backendTeamJoin,
  backendTeamList,
  backendTeamGet,
  backendTeamLeave, backendDeleteAccount, backendTeachTurn, backendTeachEvaluate,
  backendCodingTask,
  backendCodingGrade,
  backendDesignTask,
  backendDesignGrade,
  backendDesignCurveball,
  backendEstimationTask,
  backendEstimationSummary,
  backendBottleneckTask,
  backendBottleneckHint,
  backendBottleneckGrade,
  backendExtractPdf, backendGlobalPublish, backendGlobalUnpublish, backendGlobalList, backendGlobalFetch, backendGlobalReport,
} from "../sync/api.js";
import {
  MAX_PDF_BYTES, captureNote, classifyUrl, json3ToSegments, pdfTitleFromUrl, sampleForGeneration, transcriptToText,
  truncateForGeneration,
} from "../storage/sources.js";
import { resolveCaptureTab } from "./capture-target.js";

/** chrome.tabs in the promise shape resolveCaptureTab takes. */
const tabsApi = {
  get: (id) => new Promise((resolve) => chrome.tabs.get(id, (t) => resolve(chrome.runtime.lastError ? null : t))),
  query: (q) => new Promise((resolve) => chrome.tabs.query(q, (t) => resolve(t || []))),
};
const captureTab = (msg) => resolveCaptureTab(msg, tabsApi, chrome.runtime.getURL(""));

async function captureYouTube(tabId, source) {
  let result;
  try {
    const results = await new Promise((resolve, reject) => {
      // MAIN world: the extractor watches the player's own caption request.
      chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func: extractYouTubeTranscript }, (r) =>
        chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(r)
      );
    });
    result = results?.[0]?.result;
  } catch {
    throw new Error("Mafsar can't read this YouTube tab. Allow access when asked, then try again.");
  }
  if (!result?.ok) {
      if (result?.reason === "scraper-failed") throw new Error("YouTube might have changed its layout. We couldn't read the transcript.");
      throw new Error("This video has no transcript to learn from.");
    }
  const segments = result.json3 ? json3ToSegments(result.json3) : result.segments;
  const full = transcriptToText(segments);
  if (full.length < 200) throw new Error("This video's transcript is too short to make cards from.");
  // Excerpts from across the whole video, not its opening minutes only.
  const { text, truncated, sampled, keptPercent } = sampleForGeneration(full);
  const r = await saveAndGenerate({
    source: "youtube",
    sourceLabel: "YouTube",
    title: result.title || "YouTube video",
    url: `https://www.youtube.com/watch?v=${source.videoId}`,
    capturedAt: Date.now(),
    messages: [{ role: "user", text }],
  });
  if (!r.generated) throw new Error(r.reason || "generation-failed");
  return { ...r, note: captureNote({ truncated, sampled, keptPercent }) };
}

async function capturePdf(url, source) {
  if (source.local) {
    throw new Error("Mafsar can't open PDFs from your computer yet. Open one from a website instead.");
  }
  let bytes;
  try {
    // With the user's cookies, so a PDF behind a course or library login still works.
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(String(res.status));
    bytes = await res.arrayBuffer();
  } catch {
    throw new Error("Couldn't download this PDF. Allow Mafsar to read this site when asked, then try again.");
  }
  if (bytes.byteLength > MAX_PDF_BYTES) throw new Error("This PDF is too large. The limit is 15 MB.");
  const extracted = await backendExtractPdf(bytes);
  const { text, truncated, keptPercent } = truncateForGeneration(extracted.text);
  const r = await saveAndGenerate({
    source: "pdf",
    sourceLabel: "PDF",
    title: pdfTitleFromUrl(url),
    url,
    capturedAt: Date.now(),
    messages: [{ role: "user", text }],
  });
  if (!r.generated) throw new Error(r.reason || "generation-failed");
  return { ...r, note: captureNote({ truncated, keptPercent, pages: extracted.pages, pagesRead: extracted.pagesRead }) };
}

/**
 * Runs INSIDE a YouTube watch page, in the page's MAIN world (serialized by
 * executeScript, so it must stay self-contained).
 *
 * Verified live on 2026-09-28 against a 79-minute MIT OpenCourseWare lecture:
 * the caption path returned the whole transcript; the transcript-panel path did
 * not, because YouTube refused the panel's get_transcript call (400). The panel
 * is kept only as a fallback. tests/youtube-captions.test.mjs covers both.
 *
 * Never fetches captionTracks[].baseUrl itself: without the player's
 * proof-of-origin token those return an empty body. It only watches the request
 * the player makes, which carries the token.
 */
async function extractYouTubeTranscript() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const readTitle = () =>
    (document.querySelector("h1.ytd-watch-metadata")?.textContent || document.title || "")
      .replace(/\s*-\s*YouTube\s*$/, "")
      .trim();

  // 1. The captions the player loads itself. Checked live on 2026-09-28: the
  // transcript panel below spins forever because YouTube answers its
  // get_transcript call with a 400 unless it carries a proof-of-origin token.
  // The player's own /api/timedtext request carries one and succeeds, so watch
  // for that request and have the player make it. Needs the MAIN world: the
  // isolated world has its own XMLHttpRequest and never sees the player's.
  const captureCaptions = async () => {
    const btn = /** @type {HTMLElement|null} */ (document.querySelector(".ytp-subtitles-button"));
    // Not a visibility check: YouTube hides this button with an inline
    // display:none even on videos that have captions switched on, and clicking
    // it still works. A video with no captions simply never makes the request.
    if (!btn || btn.getAttribute("aria-disabled") === "true") return null;
    let body = null;
    const XHR = window.XMLHttpRequest;
    const origOpen = XHR.prototype.open;
    const origFetch = window.fetch;
    XHR.prototype.open = function (method, url) {
      if (String(url).includes("/api/timedtext")) {
        this.addEventListener("load", () => {
          if (this.status === 200 && this.responseText) body = body || this.responseText;
        });
      }
      return origOpen.apply(this, arguments);
    };
    window.fetch = function (input) {
      // A string, a Request (.url) or a URL (whose string form is its href).
      const url = typeof input === "string" ? input : /** @type {any} */ (input)?.url || String(input);
      const pending = origFetch.apply(this, arguments);
      if (url && String(url).includes("/api/timedtext")) {
        pending.then((r) => (r.ok ? r.clone().text() : null)).then((t) => { if (t) body = body || t; }).catch(() => {});
      }
      return pending;
    };
    const wasOn = btn.getAttribute("aria-pressed") === "true";
    try {
      // Off and on again: already-showing captions were fetched before we listened.
      if (wasOn) { btn.click(); await sleep(300); }
      btn.click();
      for (let i = 0; i < 30 && !body; i++) await sleep(200);
    } finally {
      XHR.prototype.open = origOpen;
      window.fetch = origFetch;
      // Leave the video the way the learner had it.
      if (!wasOn && btn.getAttribute("aria-pressed") === "true") btn.click();
    }
    return body;
  };

  const json3 = await captureCaptions();
  if (json3) return { ok: true, title: readTitle(), json3 };

  // 2. Fallback: YouTube's transcript panel, which still loads in some sessions.

  const readSegments = () => {
    // Primary: ytd-transcript-segment-renderer
    // Fallback: ytd-transcript-segment-list-renderer > div
    let els = Array.from(document.querySelectorAll("ytd-transcript-segment-renderer"));
    if (!els.length) els = Array.from(document.querySelectorAll("ytd-transcript-segment-list-renderer > div"));
    
    return els.map((el) => {
      // Primary: .segment-timestamp / .segment-text
      // Fallback: [class*="timestamp"] / [class*="text"]
      const tsNode = el.querySelector(".segment-timestamp") || el.querySelector("[class*='timestamp']");
      const textNode = el.querySelector(".segment-text") || el.querySelector("[class*='text']");
      return {
        start: (tsNode?.textContent || "").trim(),
        text: (textNode?.textContent || "").trim(),
      };
    }).filter((s) => s.text);
  };

  let segments = readSegments();
  let clickedButton = false;
  if (!segments.length) {
    // The "Show transcript" button lives in the collapsed description.
    // Primary: #description-inline-expander #expand
    // Fallback: button[aria-label="Expand"]
    const expandBtn = /** @type {HTMLElement|null} */ (
      document.querySelector("#description-inline-expander #expand") ||
      document.querySelector('button[aria-label="Expand"]')
    );
    expandBtn?.click();
    await sleep(300);
    
    // Primary: ytd-video-description-transcript-section-renderer button
    // Fallback: button[aria-label="Show transcript"]
    const button = /** @type {HTMLElement|null} */ (
      document.querySelector("ytd-video-description-transcript-section-renderer button") ||
      document.querySelector('button[aria-label="Show transcript"]')
    );
    
    if (!button) return { ok: false, reason: "no-transcript" }; // Genuine absence
    
    button.click();
    clickedButton = true;
    for (let i = 0; i < 25 && !segments.length; i++) {
      await sleep(200);
      segments = readSegments();
    }
  }
  
  if (!segments.length) {
    // If we clicked the button but no segments appeared, the markup changed and our parser broke.
    return { ok: false, reason: clickedButton ? "scraper-failed" : "no-transcript" };
  }
  
  const title = readTitle();
  return { ok: true, title, segments };
}

/** Generate a study set for a captured session via the backend. */
async function generateForSession(session, mode) {
  const generated = await backendGenerate(session.messages, session.title, mode);
  const now = Date.now();
  // Attach client-side SM-2 scheduling + ids to the server's cards.
  generated.flashcards = (generated.flashcards || []).map((c) => ({
    id: uid(),
    front: String(c.front),
    back: String(c.back),
    updatedAt: new Date(now).toISOString(),
    ...initSchedule(now),
  }));
  generated.quiz = (generated.quiz || []).map((q) => ({
    id: uid(),
    q: String(q.q),
    options: (Array.isArray(q.options) ? q.options : []).map(String),
    answer: Math.max(0, Math.min((q.options?.length || 1) - 1, Number(q.answer) || 0)),
    explain: q.explain ? String(q.explain) : "",
    updatedAt: new Date(now).toISOString(),
  }));
  return generated;
}

/**
 * Save generated content WITHOUT wiping fields the user already set on the set
 * (examDate, mode, summary) — regeneration used to lose them.
 */
async function saveGeneratedStudySet(session, generated) {
  const existing = await getStudySetForSession(session.id);
  // A regenerated card whose front matches an old card is the same concept —
  // keep its SM-2 schedule (easiness/interval/reps/dueDate) so review history
  // survives a regen. New fronts start fresh; dropped fronts just vanish.
  const byFront = new Map(
    (existing?.flashcards || [])
      .filter((c) => !c.deleted)
      .map((c) => [String(c.front).trim().toLowerCase(), c])
  );
  const flashcards = generated.flashcards.map((c) => {
    const old = byFront.get(String(c.front).trim().toLowerCase());
      return old
        ? { ...c, easiness: old.easiness, interval: old.interval, repetitions: old.repetitions, dueDate: old.dueDate, stability: old.stability, difficulty: old.difficulty, state: old.state, lapses: old.lapses, lastReview: old.lastReview }
        : c;
  });
  
  // Chains (Medicine mode): merge by condition so learner edits survive.
  // Other modes return no chains, so existing ones are left as they are.
  const chains = Array.isArray(generated.chains)
    ? mergeChains(existing?.chains || [], generated.chains, { uid })
    : existing?.chains;

  return saveStudySet({
    sessionId: session.id,
    title: existing?.title ?? session.title,
    mode: existing?.mode ?? generated.mode,
    examDate: existing?.examDate ?? null,
    summary: existing?.summary,
    createdAt: existing?.createdAt ?? Date.now(),
    flashcards,
    quiz: generated.quiz,
    ...(chains ? { chains } : {}),
    // "This looks like medicine" hint, kept until the learner answers it.
    suggestMedicine: existing?.suggestMedicine ?? !!generated.suggestMedicine,
    dismissedMedicine: existing?.dismissedMedicine,
  });
}

// A store update has downloaded but only applies once the extension restarts.
// Don't reload here: that would cut off a review in progress. The panel shows
// a banner and the user restarts when ready (APPLY_UPDATE).
chrome.runtime.onUpdateAvailable?.addListener((details) => {
  chrome.storage.local.set({ updateReady: details.version });
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "update") {
    chrome.storage.local.remove(["updateReady", "clientOutdated"]);
  }
  registerContextMenus();
});

// --- Toolbar click --------------------------------------------------------------
// Opening the sidebar (Firefox) or side panel (Chrome) is only allowed
// synchronously inside the click. After an `await` the call no longer counts as
// the user's, the browser refuses it, and the icon does nothing at all. So the
// "open in a tab" preference has to be known before the click arrives.
//
// Firefox suspends this page after ~30s idle and the click is what wakes it, so
// a storage read started at load is still pending when the click lands. The
// page there has localStorage, which is synchronous, so the preference is
// mirrored into it. Chrome's worker has no localStorage and doesn't need it:
// setPanelBehavior makes Chrome open the panel itself, and onClicked only fires
// in tab mode, where opening a tab needs no user gesture.
const OPEN_IN_TAB_MIRROR = "mafsar.openInTab";

function readOpenInTabMirror() {
  try {
    return globalThis.localStorage?.getItem(OPEN_IN_TAB_MIRROR) === "1";
  } catch {
    return false;
  }
}

let openInTab = readOpenInTabMirror();

function rememberOpenInTab(value) {
  openInTab = !!value;
  try {
    globalThis.localStorage?.setItem(OPEN_IN_TAB_MIRROR, openInTab ? "1" : "0");
  } catch {
    /* no localStorage in Chrome's worker; it doesn't need the mirror */
  }
  // Re-asserted on every start, not only on install: without it the icon can go
  // dead after a worker restart.
  const sp = chrome["sidePanel"];
  if (sp?.setPanelBehavior) sp.setPanelBehavior({ openPanelOnActionClick: !openInTab }).catch(() => {});
}

chrome.storage.local.get(["settings"], (obj) => rememberOpenInTab(obj?.settings?.openInTab));
chrome.storage.onChanged?.addListener((changes, area) => {
  if (area === "local" && changes.settings) rememberOpenInTab(changes.settings.newValue?.openInTab);
});

/** Focus the Mafsar tab if one is open, otherwise open one. */
async function openMafsarTab(fromTab) {
  const url = chrome.runtime.getURL("src/ui/panel.html");
  const tabs = await new Promise((resolve) => chrome.tabs.query({ url }, (t) => resolve(t || [])));
  if (tabs.length) {
    chrome.tabs.update(tabs[0].id, { active: true });
    if (tabs[0].windowId !== fromTab?.windowId) chrome.windows.update(tabs[0].windowId, { focused: true });
  } else {
    chrome.tabs.create({ url });
  }
}

if (chrome.action?.onClicked) {
  // Deliberately not async: see above.
  chrome.action.onClicked.addListener((tab) => {
    if (openInTab) {
      openMafsarTab(tab).catch(() => {});
      return;
    }
    if (/** @type {any} */ (globalThis.chrome)?.sidebarAction) {
      chrome["sidebarAction"].toggle();
    } else {
      const sp = chrome["sidePanel"];
      if (sp?.open && tab?.windowId != null) sp.open({ windowId: tab.windowId }).catch(() => {});
    }
  });
}

// --- Universal capture (any page, not just AI chats) --------------------------

/** Runs INSIDE the page (serialized by executeScript — must stay self-contained). */
function extractPage() {
  const sel = (window.getSelection && window.getSelection().toString().trim()) || "";
  let text = sel;
  if (text.length < 40) {
    // No meaningful selection → grab the main content instead of the whole page chrome.
    const el = document.querySelector("main, article") || document.body;
    text = ((/** @type {any} */ (el)).innerText || "").trim();
  }
  return {
    title: document.title || location.hostname,
    url: location.href,
    text: text.slice(0, 24000),
  };
}

function notify(message) {
  if (chrome.notifications) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon128.png"),
      title: "Mafsar",
      message,
    });
  }
}

/** Extract text from a tab and run the normal save → generate flow. */
async function captureTabAndSave(tabId) {
  const tab = await new Promise((resolve) =>
    chrome.tabs.get(tabId, (t) => resolve(chrome.runtime.lastError ? null : t))
  );
  const source = classifyUrl(tab?.url || "");
  if (source.kind === "youtube") return captureYouTube(tabId, source);
  if (source.kind === "pdf") return capturePdf(tab.url, source);
  let page;
  try {
    const results = await new Promise((resolve, reject) => {
      chrome.scripting.executeScript({ target: { tabId }, func: extractPage }, (r) =>
        chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(r)
      );
    });
    page = results?.[0]?.result;
  } catch {
    throw new Error("Can't capture this page — try a normal web page.");
  }
  if (!page?.text || page.text.length < 200) {
    throw new Error("Not enough text to capture.");
  }
  let host = "web";
  try {
    host = new URL(page.url).hostname.replace(/^www\./, "");
  } catch { /* keep fallback */ }
  const session = {
    source: "web",
    sourceLabel: host,
    title: page.title || host,
    url: page.url,
    capturedAt: Date.now(),
    messages: [{ role: "user", text: page.text }],
  };
  const r = await saveAndGenerate(session);
  if (!r.generated) throw new Error(r.reason || "generation-failed");
  return r;
}

/**
 * Send a message to a tab and resolve with the reply, or `null` if the tab has
 * no listener, the listener errors, or it never answers within `timeoutMs`.
 * The timeout is the important part: every content script here returns `true`
 * from onMessage, so an unrecognised type leaves the channel open forever.
 */
function askTab(tabId, msg, timeoutMs = 4000) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    const timer = setTimeout(() => done(null), timeoutMs);
    try {
      chrome.tabs.sendMessage(tabId, msg, (r) => {
        clearTimeout(timer);
        done(chrome.runtime.lastError ? null : r);
      });
    } catch {
      clearTimeout(timer);
      done(null);
    }
  });
}

/** Runs INSIDE the page for generic last-answer extraction. */
function extractLastAnswerGeneric() {
  const candidates = document.querySelectorAll("div, p, article, section, main");
  let bestContainer = null;
  let maxScore = -1;
  let bestDepth = -1;

  // Bound the work
  const limit = Math.min(candidates.length, 5000);

  for (let i = 0; i < limit; i++) {
    const el = candidates[i];
    // Visibility check tolerant of position: fixed
    if (el.getClientRects().length === 0) continue;

    let score = 0;
    // Compute turnScore: number of direct children with text length > 30
    for (let j = 0; j < el.children.length; j++) {
      const child = el.children[j];
      if (child.getClientRects().length === 0) continue;
      const text = ((/** @type {HTMLElement} */ (child)).innerText || "").trim();
      if (text.length > 30) score++;
    }

    if (score < 2) continue;

    let depth = 0;
    let curr = el;
    while (curr.parentElement) {
      depth++;
      curr = curr.parentElement;
    }

    if (score > maxScore || (score === maxScore && depth > bestDepth)) {
      maxScore = score;
      bestDepth = depth;
      bestContainer = el;
    }
  }

  if (!bestContainer) {
    return { ok: false, fallback: true };
  }

  // Walk direct children from the end
  let answer = null;
  let question = null;
  
  for (let i = bestContainer.children.length - 1; i >= 0; i--) {
    const child = bestContainer.children[i];
    if (child.getClientRects().length === 0) continue;
    const text = ((/** @type {HTMLElement} */ (child)).innerText || "").trim();
    if (!text) continue;

    if (answer === null) {
      answer = text;
    } else if (question === null) {
      question = text;
      break;
    }
  }

  if (answer === null) {
    return { ok: false, fallback: true };
  }

  return { ok: true, question, answer, title: document.title };
}

async function captureLastAnswerGeneric(tabId, url, host) {
  let result;
  try {
    const results = await new Promise((resolve, reject) => {
      chrome.scripting.executeScript({ target: { tabId }, func: extractLastAnswerGeneric }, (r) =>
        chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(r)
      );
    });
    result = results?.[0]?.result;
  } catch {
    throw new Error("Can't read this page. Try reloading.");
  }
  
  if (!result || !result.ok) {
    if (result && result.fallback) {
      // Fallback to full page text
      return await captureTabAndSave(tabId);
    }
    throw new Error(result?.error || "Couldn't find an answer here.");
  }

  const qStr = result.question ? String(result.question).trim() : null;
  const rawAns = String(result.answer).trim();

  const la = globalThis.__mafsarLastAnswer;
  if (!la) throw new Error("Mafsar couldn't load the extractor — reload the extension.");
  const aStr = la.cleanAnswerText(rawAns);

  if (aStr.length < la.MIN_ANSWER_CHARS) {
    throw new Error("That answer's too short to make cards from.");
  }

  const title = la.deriveTitle(qStr, aStr) || host;

  const session = {
    source: "generic",
    sourceLabel: host,
    title,
    url,
    capturedAt: Date.now(),
    captureMode: "answer",
    messages: qStr 
      ? [{ role: "user", text: qStr }, { role: "assistant", text: aStr }]
      : [{ role: "assistant", text: aStr }]
  };

  const r = await saveAndGenerate(session);
  if (!r.generated) throw new Error(r.reason || "generation-failed");
  return r;
}

function registerContextMenus() {
  if (!chrome.contextMenus) return;
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "mafsar-save-page", title: "Save page to Mafsar", contexts: ["page"] });
    chrome.contextMenus.create({ id: "mafsar-save-selection", title: "Save selection to Mafsar", contexts: ["selection"] });
  });
}

if (chrome.contextMenus?.onClicked) {
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab?.id) return;
    try {
      const r = await captureTabAndSave(tab.id);
      notify(`Saved · ${r.cards} cards from ${r.session.sourceLabel || "page"}`);
    } catch (e) {
      notify(e?.message || "Capture failed.");
    }
  });
}

// Message router. Content script + side panel both talk to us via runtime messages.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handle(msg)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
  return true; // async response
});

/** Store a captured session and generate its study set via the backend. */
async function saveAndGenerate(sessionRecord) {
  const session = await addSession(sessionRecord);
  try {
    const generated = await generateForSession(session);
    const studySet = await saveGeneratedStudySet(session, generated);
    return { session, generated: true, cards: studySet.flashcards.length, quiz: studySet.quiz.length };
  } catch (e) {
    return { session, generated: false, reason: e?.message || "generation-failed" };
  }
}

async function handle(msg) {
  switch (msg?.type) {
    case "SAVE_SESSION": {
      const session = await addSession(msg.payload);
      return { session };
    }

    case "SAVE_AND_GENERATE": {
      // The "Save to Mafsar" page action: store the conversation, then generate
      // flashcards + quiz via the backend (server-side API key).
      return await saveAndGenerate(msg.payload);
    }

    // Universal capture from the panel: no content script needed — the worker
    // extracts the active tab's text itself.
    case "CAPTURE_UNIVERSAL": {
      // The panel sends the tab it means: with Mafsar open in a tab of its own,
      // the active tab is Mafsar, and capturing that fails.
      const tab = await captureTab(msg);
      return await captureTabAndSave(tab.id);
    }

    case "CAPTURE_LAST_ANSWER_SMART": {
      const tab = await captureTab(msg);

      // Try pinging the adapter first. A short timeout here: a live script
      // answers instantly, and a slow one must not stall the whole capture.
      const ping = await askTab(tab.id, { type: "MAFSAR_PING" }, 1500);

      if (ping?.ok) {
        // Ask for raw turns and extract here. The worker imports last-answer.js
        // at the top of this file, so extraction cannot fail just because the
        // page is missing its copy — the cause of "Mafsar couldn't load".
        let resp = await askTab(tab.id, { type: "GET_MESSAGES" });
        if (!resp) {
          // A content script from an older version has no GET_MESSAGES branch
          // and never calls sendResponse, so askTab times out. Fall back to the
          // handler that version does have.
          const legacy = await askTab(tab.id, { type: "CAPTURE_LAST_ANSWER" });
          if (!legacy) throw new Error("Content script stopped responding — reload the page.");
          if (!legacy.ok) throw new Error(legacy.error || "Nothing to capture.");
          return await saveAndGenerate(legacy.session);
        }
        if (!resp.ok) throw new Error(resp.error || "Nothing to capture.");
        if (resp.generating) throw new Error("Still writing — wait for it to finish.");

        // Guard the global rather than assuming the side-effect import ran.
        // An unguarded read here would throw a bare TypeError — reintroducing
        // the opaque failure this whole path exists to remove.
        const lastAnswer = globalThis.__mafsarLastAnswer;
        if (!lastAnswer) {
          const legacy = await askTab(tab.id, { type: "CAPTURE_LAST_ANSWER" });
          if (!legacy?.ok) throw new Error(legacy?.error || "Couldn't read the last answer.");
          return await saveAndGenerate(legacy.session);
        }
        const result = lastAnswer.extractLastAnswer(resp.messages || []);
        if (!result.ok) {
          throw new Error(
            result.reason === "no-answer"
              ? "No answer to save yet."
              : "That answer's too short to make cards from."
          );
        }
        return await saveAndGenerate({
          source: resp.source,
          sourceLabel: resp.sourceLabel,
          title: result.title || resp.title || "Saved answer",
          url: tab.url || "",
          capturedAt: Date.now(),
          captureMode: "answer",
          messages: lastAnswer.answerMessages(result.question, result.answer),
        });
      }

      // No adapter - use generic extraction
      let host = "web";
      try { host = new URL(tab.url).hostname.replace(/^www\./, ""); } catch {}
      return await captureLastAnswerGeneric(tab.id, tab.url, host);
    }

    case "IMPORT_CARDS": {
      const rawCards = Array.isArray(msg.cards) ? msg.cards : [];
      const now = Date.now();
      const flashcards = rawCards
        .filter((c) => c && c.front)
        .map((c) => ({
          id: uid(),
          front: String(c.front),
          back: String(c.back || ""),
          ...initSchedule(now),
        }));
      if (!flashcards.length) throw new Error("No cards to import.");

      const title = msg.title || "Imported set";
      const session = await addSession({
        source: msg.source || "quizlet",
        sourceLabel: msg.sourceLabel || "Imported",
        title,
        url: msg.url || "",
        capturedAt: now,
        messages: [],
        importedCount: flashcards.length,
      });
      await saveStudySet({ sessionId: session.id, title, createdAt: now, flashcards, quiz: [] });
      return { count: flashcards.length };
    }

    case "LIST_SESSIONS": {
      const sessions = await getSessions();
      return { sessions };
    }

    case "DELETE_SESSION": {
      await deleteSession(msg.sessionId);
      return {};
    }

    case "GET_STUDY_SET": {
      const studySet = await getStudySetForSession(msg.sessionId);
      return { studySet };
    }

    case "GENERATE_STUDY_SET": {
      const sessions = await getSessions();
      const session = sessions.find((s) => s.id === msg.sessionId);
      if (!session) throw new Error("Session not found.");
      // Regenerating keeps the set's mode, so design and medicine sets get their card style.
      const existingSet = await getStudySetForSession(session.id);
      const generated = await generateForSession(session, existingSet?.mode);
      const studySet = await saveGeneratedStudySet(session, generated);
      return { studySet };
    }

    // AI short-answer grading — grounded strictly in the reference material.
    case "GRADE_ANSWER": {
      const grading = await backendGrade({
        question: String(msg.question || ""),
        reference: String(msg.reference || ""),
        answer: String(msg.answer || ""),
      });
      return { grading };
    }

    // Coding mode: a small task from a concept, then rubric grading of the code.
    case "GENERATE_CODING_TASK": {
      const task = await backendCodingTask({
        concept: String(msg.concept || ""),
        reference: String(msg.reference || ""),
        language: msg.language || undefined,
      });
      return { task };
    }

    

    case "DESIGN_TASK": {
      // mode "clinical" runs the same route as a Medicine clinical case.
      return backendDesignTask({
        concept: String(msg.concept || ""),
        reference: Array.isArray(msg.reference) ? msg.reference : [],
        mode: msg.mode === "clinical" ? "clinical" : "design",
      });
    }

    case "DESIGN_GRADE": {
      return backendDesignGrade({
        task: String(msg.task || ""),
        answer: String(msg.answer || ""),
        rubric: Array.isArray(msg.rubric) ? msg.rubric.map(String) : [],
        mode: msg.mode === "clinical" ? "clinical" : "design",
        ...(msg.state ? { state: String(msg.state) } : {}),
        ...(msg.curveball ? { curveball: String(msg.curveball), originalAnswer: String(msg.originalAnswer || "") } : {}),
      });
    }

    case "DESIGN_CURVEBALL": {
      return backendDesignCurveball({
        task: String(msg.task || ""),
        answer: String(msg.answer || ""),
        previous: Array.isArray(msg.previous) ? msg.previous.map(String) : [],
        mode: msg.mode === "clinical" ? "clinical" : "design",
        ...(msg.state ? { state: String(msg.state) } : {}),
      });
    }

    case "ESTIMATION_TASK": {
      return backendEstimationTask({
        concept: String(msg.concept || ""),
        reference: Array.isArray(msg.reference) ? msg.reference : [],
      });
    }

    case "ESTIMATION_SUMMARY": {
      return backendEstimationSummary({ results: Array.isArray(msg.results) ? msg.results : [] });
    }

    case "BOTTLENECK_TASK": {
      return backendBottleneckTask({
        concept: String(msg.concept || ""),
        reference: Array.isArray(msg.reference) ? msg.reference : [],
      });
    }

    case "BOTTLENECK_HINT": {
      return backendBottleneckHint({ state: String(msg.state || "") });
    }

    case "BOTTLENECK_GRADE": {
      return backendBottleneckGrade({
        state: String(msg.state || ""),
        answer: String(msg.answer || ""),
        usedHint: !!msg.usedHint,
      });
    }

    case "GRADE_CODING": {
      const grading = await backendCodingGrade({
        task: String(msg.task || ""),
        rubric: Array.isArray(msg.rubric) ? msg.rubric.map(String) : [],
        language: String(msg.language || "text"),
        expectedLines: Number(msg.expectedLines) || 15,
        code: String(msg.code || ""),
      });
      return { grading };
    }

    // Fresh application exercise for a concept — new scenario every call.
    case "GENERATE_HYPOTHETICAL": {
      const hypothetical = await backendHypothetical({
        concept: String(msg.concept || ""),
        reference: String(msg.reference || ""),
      });
      return { hypothetical };
    }

    // Conversation TL;DR + key points, stored on the study set.
    case "SUMMARIZE": {
      const sessions = await getSessions();
      const session = sessions.find((s) => s.id === msg.sessionId);
      if (!session) throw new Error("Session not found.");
      const existing = await getStudySetForSession(session.id);
      if (!existing) throw new Error("Generate flashcards first.");
      const summary = await backendSummarize(session.messages);
      existing.summary = summary;
      await saveStudySet(existing);
      return { summary };
    }

    // Tiny AI description of a set (title + card fronts -> 5-6 words).
    case "GET_BLURB": {
      const sets = await getStudySetForSession(msg.sessionId);
      if (!sets?.flashcards?.length) throw new Error("Set has no cards.");
      const { blurb } = await backendBlurb(
        sets.title || msg.title || "",
        sets.flashcards.map((c) => c.front)
      );
      sets.blurb = blurb; // cached on the set (local-only; not synced)
      await saveStudySet(sets);
      return { blurb };
    }

    // Billing
    case "BILLING_CHECKOUT": {
      const { url } = await backendBillingCheckout(msg.plan);
      return { url };
    }
    case "APPLY_UPDATE":
      // Reply first; reloading tears down this worker and the open panel.
      setTimeout(() => chrome.runtime.reload(), 150);
      return {};

    case "TEACH_TURN": {
      const turn = await backendTeachTurn({
        topic: String(msg.topic || ""),
        persona: msg.persona === "beginner" ? "beginner" : "child",
        cards: Array.isArray(msg.cards) ? msg.cards : [],
        messages: Array.isArray(msg.messages) ? msg.messages : [],
        wantHint: !!msg.wantHint,
      });
      return { turn };
    }

    case "TEACH_EVALUATE": {
      const evaluation = await backendTeachEvaluate({
        topic: String(msg.topic || ""),
        persona: msg.persona === "beginner" ? "beginner" : "child",
        cards: Array.isArray(msg.cards) ? msg.cards : [],
        messages: Array.isArray(msg.messages) ? msg.messages : [],
      });
      return { evaluation };
    }

    case "DELETE_ACCOUNT": {
      await backendDeleteAccount({ password: msg.password ? String(msg.password) : "" });
      // The account is gone, so its sets and its dead session go with it — but
      // another account signed in on this device keeps its own partition.
      await deleteActiveAccountData();
      await new Promise((resolve) => chrome.storage.local.remove(["auth", "activeAccountId"], () => resolve()));
      return { deleted: true };
    }
    case "BILLING_PORTAL": {
      const { url } = await backendBillingPortal();
      return { url };
    }

    // Sharing: a short code hands someone a copy of one set.
    case "SHARE_CREATE": {
      const { code } = await backendShareCreate(msg.setId);
      return { code };
    }

    
    case "GLOBAL_PUBLISH":
      return await backendGlobalPublish(msg.setId);
    case "GLOBAL_UNPUBLISH":
      return await backendGlobalUnpublish(msg.setId);
    case "GLOBAL_LIST":
      return await backendGlobalList(msg.tab, msg.q, msg.cursor);
    case "GLOBAL_ADD": return await backendGlobalAdd(msg.id);
      case "GLOBAL_FETCH":
      return await backendGlobalFetch(msg.id);
    case "GLOBAL_REPORT":
      return await backendGlobalReport(msg.id);

    case "SHARE_FETCH": {
      return await backendShareFetch(msg.code);
    }

    case "SHARE_REVOKE": {
      await backendShareRevoke(msg.code);
      return {};
    }

    // Teams: create/join/list/inspect/leave, all through the account token.
    case "TEAM_CREATE": {
      const team = await backendTeamCreate(String(msg.name || ""));
      return { team };
    }

    case "TEAM_JOIN": {
      const team = await backendTeamJoin(String(msg.code || ""));
      return { team };
    }

    case "TEAM_LIST": {
      const teams = await backendTeamList();
      return { teams };
    }

    case "TEAM_GET": {
      const team = await backendTeamGet(String(msg.id || ""));
      return { team };
    }

    case "TEAM_LEAVE": {
      await backendTeamLeave(String(msg.id || ""));
      return {};
    }

    case "LANDING_IMPORT_SHARE": {
      const code = String(msg.code).toUpperCase();
      const shared = await backendShareFetch(code);
      const now = Date.now();
      const session = await addSession({
        source: "share",
        sourceLabel: `Shared: ${code}`,
        title: shared.title,
        url: "",
        capturedAt: now,
        messages: [],
        importedCount: shared.cards.length,
      });
      const flashcards = shared.cards.map((c) => ({
        id: uid(),
        front: String(c.front),
        back: String(c.back),
        updatedAt: new Date(now).toISOString(),
        ...initSchedule(now),
      }));
      const quiz = (shared.quiz || []).map((q) => ({
        id: uid(),
        q: String(q.q),
        options: q.options.map(String),
        answer: Number(q.answer) || 0,
        explain: String(q.explain || ""),
        updatedAt: new Date(now).toISOString(),
      }));
      await saveStudySet({
        sessionId: session.id,
        title: shared.title,
        createdAt: now,
        flashcards,
        quiz,
      });
      return { success: true };
    }

    case "SET_OPEN_IN_TAB": {
      // storage.onChanged would get here too; doing it now means the very next
      // click already behaves.
      rememberOpenInTab(msg.value);
      return {};
    }
    default:
      throw new Error(`Unknown message type: ${msg?.type}`);
  }
}

// --- Auto-inject on install/update so existing tabs don't need a reload ---
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason !== "install" && details.reason !== "update") return;

  const manifest = chrome.runtime.getManifest();
  const scripts = manifest.content_scripts || [];
  for (const cs of scripts) {
    let tabs = [];
    try {
      tabs = await new Promise((resolve) => chrome.tabs.query({ url: cs.matches }, resolve));
    } catch {
      continue;
    }
    for (const tab of tabs) {
      if (tab.id) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: cs.js
        }).catch(() => {});
        if (cs.css) {
          chrome.scripting.insertCSS({
            target: { tabId: tab.id },
            files: cs.css
          }).catch(() => {});
        }
      }
    }
  }
});

