// Background service worker (ES module). Orchestrates capture storage and LLM
// generation, and opens the side panel when the toolbar icon is clicked.

import {
  getSettings,
  addSession,
  getSessions,
  deleteSession,
  getStudySetForSession,
  saveStudySet,
  uid,
} from "../storage/store.js";
import { initSchedule } from "../storage/srs.js";
import { generateStudySet } from "../llm/generate.js";

// Chrome: open the side panel when the toolbar icon is clicked.
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
});

// Firefox: no sidePanel API — toggle the sidebar when the toolbar icon is clicked.
if (chrome.action?.onClicked && globalThis.chrome?.sidebarAction) {
  chrome.action.onClicked.addListener(() => {
    chrome.sidebarAction.toggle();
  });
}

// Message router. Content script + side panel both talk to us via runtime messages.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handle(msg)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
  return true; // async response
});

async function handle(msg) {
  switch (msg?.type) {
    case "SAVE_SESSION": {
      const session = await addSession(msg.payload);
      return { session };
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
      const settings = await getSettings();
      const sessions = await getSessions();
      const session = sessions.find((s) => s.id === msg.sessionId);
      if (!session) throw new Error("Session not found.");
      const generated = await generateStudySet(settings, session);
      const studySet = await saveStudySet({
        sessionId: session.id,
        title: session.title,
        createdAt: Date.now(),
        flashcards: generated.flashcards,
        quiz: generated.quiz,
      });
      return { studySet };
    }

    default:
      throw new Error(`Unknown message type: ${msg?.type}`);
  }
}
