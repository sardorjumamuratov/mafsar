// Background service worker (ES module). Orchestrates capture storage and LLM
// generation, and opens the side panel when the toolbar icon is clicked.

import {
  getSettings,
  addSession,
  getSessions,
  deleteSession,
  getStudySetForSession,
  saveStudySet,
} from "../storage/store.js";
import { generateStudySet } from "../llm/generate.js";

// Open the side panel on toolbar click.
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
});

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
