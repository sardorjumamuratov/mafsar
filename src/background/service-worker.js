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
  return saveStudySet({
    sessionId: session.id,
    title: existing?.title ?? session.title,
    mode: existing?.mode,
    examDate: existing?.examDate ?? null,
    summary: existing?.summary,
    createdAt: existing?.createdAt ?? Date.now(),
    flashcards: generated.flashcards,
    quiz: generated.quiz,
  });
}

// Chrome: open the side panel when the toolbar icon is clicked.
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
  scheduleReminderAlarm();
});

// Firefox: no sidePanel API — toggle the sidebar when the toolbar icon is clicked.
if (chrome.action?.onClicked && globalThis.chrome?.sidebarAction) {
  chrome.action.onClicked.addListener(() => {
    chrome.sidebarAction.toggle();
  });
}

// --- Daily study reminders ---------------------------------------------------
// A repeating alarm fires at (or shortly after) the configured time; when it
// does we check due cards and notify. Rescheduled whenever settings change.

async function scheduleReminderAlarm() {
  if (!chrome.alarms) return;
  const settings = await getSettings();
  if (!settings.reminders || !settings.remindTime) {
    chrome.alarms.clear("mafsar-reminder");
    return;
  }
  const [h, m] = String(settings.remindTime).split(":").map(Number);
  const next = new Date();
  next.setHours(h || 19, m || 0, 0, 0);
  if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
  // periodInDays:1 repeats daily at the same wall-clock time.
  chrome.alarms.create("mafsar-reminder", {
    when: next.getTime(),
    periodInDays: 1,
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.settings) scheduleReminderAlarm();
});

if (chrome.alarms?.onAlarm) {
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== "mafsar-reminder") return;
    const { getStudySets } = await import("../storage/store.js");
    let due = 0;
    for (const set of await getStudySets()) {
      for (const card of set.flashcards || []) if (isDue(card)) due++;
    }
    if (due && chrome.notifications) {
      chrome.notifications.create({
        type: "basic",
        iconUrl: chrome.runtime.getURL("icons/icon128.png"),
        title: "Mafsar",
        message: `${due} card${due === 1 ? "" : "s"} due — keep your streak alive.`,
      });
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

async function handle(msg) {
  switch (msg?.type) {
    case "SAVE_SESSION": {
      const session = await addSession(msg.payload);
      return { session };
    }

    case "SAVE_AND_GENERATE": {
      // The "Save to Mafsar" page action: store the conversation, then generate
      // flashcards + quiz via the backend (server-side API key).
      const session = await addSession(msg.payload);
      try {
        const generated = await generateForSession(session);
        const studySet = await saveGeneratedStudySet(session, generated);
        return { session, generated: true, cards: studySet.flashcards.length, quiz: studySet.quiz.length };
      } catch (e) {
        return { session, generated: false, reason: e?.message || "generation-failed" };
      }
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

    default:
      throw new Error(`Unknown message type: ${msg?.type}`);
  }
}
