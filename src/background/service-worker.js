// Background service worker (ES module). Orchestrates capture storage and
// generation through the Mafsar backend (server-side LLM key), and opens the
// side panel when the toolbar icon is clicked.
import "../storage/last-answer.js";

import {
  addSession,
  getSessions,
  deleteSession,
  getStudySetForSession,
  saveStudySet,
  uid,
} from "../storage/store.js";
import { initSchedule } from "../storage/srs.js";
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
  backendTeamLeave,
  backendCodingTask,
  backendCodingGrade,
} from "../sync/api.js";

/** Generate a study set for a captured session via the backend. */
async function generateForSession(session) {
  const generated = await backendGenerate(session.messages, session.title);
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
      ? { ...c, easiness: old.easiness, interval: old.interval, repetitions: old.repetitions, dueDate: old.dueDate }
      : c;
  });
  return saveStudySet({
    sessionId: session.id,
    title: existing?.title ?? session.title,
    mode: existing?.mode ?? generated.mode,
    examDate: existing?.examDate ?? null,
    summary: existing?.summary,
    createdAt: existing?.createdAt ?? Date.now(),
    flashcards,
    quiz: generated.quiz,
  });
}

// Chrome: make a toolbar-icon click open the side panel. Called on every
// service worker start (not just onInstalled) so it survives worker restarts.
// Must stay a direct synchronous call — routing it through an async import
// silently loses the race with worker teardown and leaves the icon dead.
const sp = chrome['sidePanel'];
if (sp?.setPanelBehavior) {
  sp.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}

chrome.runtime.onInstalled.addListener(() => {
  registerContextMenus();
});

// Toolbar click. Chrome only fires this when openPanelOnActionClick is off, so
// it doubles as the fallback if the call above failed; Firefox always uses it.
if (chrome.action?.onClicked) {
  chrome.action.onClicked.addListener((tab) => {
    if (/** @type {any} */ (globalThis.chrome)?.sidebarAction) {
      chrome["sidebarAction"].toggle();
    } else {
      const sp2 = chrome['sidePanel'];
      if (sp2?.open && tab?.windowId != null) {
        sp2.open({ windowId: tab.windowId }).catch(() => {});
      }
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
      const text = (child.innerText || "").trim();
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
    const text = (child.innerText || "").trim();
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
      const tabs = await new Promise((resolve) =>
        chrome.tabs.query({ active: true, currentWindow: true }, (t) => resolve(t || []))
      );
      if (!tabs[0]?.id) throw new Error("No active tab.");
      return await captureTabAndSave(tabs[0].id);
    }

    case "CAPTURE_LAST_ANSWER_SMART": {
      // Content script listeners in this codebase `return true` unconditionally,
      // which promises an async reply. A script that has no branch for the
      // message never calls sendResponse, so the callback never fires — without
      // a timeout the panel would sit on "Capturing…" forever.
      const tabs = await new Promise((resolve) =>
        chrome.tabs.query({ active: true, currentWindow: true }, (t) => resolve(t || []))
      );
      const tab = tabs[0];
      if (!tab?.id) throw new Error("No active tab.");

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

        const lastAnswer = globalThis.__mafsarLastAnswer;
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
      const generated = await generateForSession(session);
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
    case "BILLING_PORTAL": {
      const { url } = await backendBillingPortal();
      return { url };
    }

    // Sharing: a short code hands someone a copy of one set.
    case "SHARE_CREATE": {
      const { code } = await backendShareCreate(msg.setId);
      return { code };
    }

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
