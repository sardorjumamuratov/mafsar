// Background service worker (ES module). Orchestrates capture storage and
// generation through the Mafsar backend (server-side LLM key), and opens the
// side panel when the toolbar icon is clicked.

import {
  getSettings,
  addSession,
  getSessions,
  deleteSession,
  getStudySetForSession,
  saveStudySet,
  uid,
} from "../storage/store.js";
import { initSchedule, isDue } from "../storage/srs.js";
import {
  backendGenerate,
  backendGrade,
  backendHypothetical,
  backendSummarize,
  backendBlurb,
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
    options: q.options.map(String),
    answer: Math.max(0, Math.min(q.options.length - 1, Number(q.answer) || 0)),
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
    if (globalThis.chrome?.sidebarAction) {
      chrome.sidebarAction.toggle();
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
    text = (el.innerText || "").trim();
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
