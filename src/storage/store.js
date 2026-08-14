// Thin wrapper over chrome.storage.local. Everything is stored locally on the
// user's machine — no sync, no server.

import { initSchedule } from "./srs.js";
//
// Shape:
//   settings        -> { apiKey, model }
//   sessions        -> Session[]          (captured conversations)
//   studySets       -> StudySet[]         (generated cards, keyed by sessionId)
// A StudySet card carries its own SM-2 scheduling fields (see srs.js).

const KEYS = {
  SETTINGS: "settings",
  SESSIONS: "sessions",
  STUDY_SETS: "studySets",
  ACTIVITY: "activity",
  REVIEW_LOG: "reviewLog",
};

const DEFAULT_SETTINGS = { provider: "gemini", apiKey: "", model: "", reminders: false, remindTime: "19:00" };
const REVIEW_LOG_CAP = 2000;

function get(key, fallback) {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (obj) => resolve(obj[key] ?? fallback));
  });
}

function set(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, () => resolve());
  });
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// --- Settings ---------------------------------------------------------------

export async function getSettings() {
  const s = await get(KEYS.SETTINGS, {});
  return { ...DEFAULT_SETTINGS, ...s };
}

export async function saveSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await set(KEYS.SETTINGS, next);
  return next;
}

// --- Sessions ---------------------------------------------------------------

export async function getSessions() {
  return get(KEYS.SESSIONS, []);
}

export async function addSession(session) {
  const sessions = await getSessions();
  const record = { id: uid(), ...session };
  sessions.unshift(record);
  await set(KEYS.SESSIONS, sessions);
  return record;
}

export async function deleteSession(id) {
  const sessions = (await getSessions()).filter((s) => s.id !== id);
  await set(KEYS.SESSIONS, sessions);
  const sets = (await getStudySets()).filter((s) => s.sessionId !== id);
  await set(KEYS.STUDY_SETS, sets);
}

// --- Study sets -------------------------------------------------------------

export async function getStudySets() {
  return get(KEYS.STUDY_SETS, []);
}

export async function getStudySetForSession(sessionId) {
  return (await getStudySets()).find((s) => s.sessionId === sessionId) || null;
}

export async function saveStudySet(studySet) {
  const sets = await getStudySets();
  const idx = sets.findIndex((s) => s.sessionId === studySet.sessionId);
  const record = { id: studySet.id || uid(), ...studySet };
  if (idx >= 0) sets[idx] = record;
  else sets.unshift(record);
  await set(KEYS.STUDY_SETS, sets);
  return record;
}

export async function updateCard(sessionId, cardId, patch) {
  const sets = await getStudySets();
  const setRec = sets.find((s) => s.sessionId === sessionId);
  if (!setRec) return null;
  const card = setRec.flashcards.find((c) => c.id === cardId);
  if (!card) return null;
  Object.assign(card, patch);
  await set(KEYS.STUDY_SETS, sets);
  return card;
}

/** Set or clear (null) the exam date for a set's cards. epoch ms or null. */
export async function setExamDate(sessionId, examDate) {
  const sets = await getStudySets();
  const setRec = sets.find((s) => s.sessionId === sessionId);
  if (!setRec) return null;
  setRec.examDate = examDate || null;
  await set(KEYS.STUDY_SETS, sets);
  return setRec;
}

export async function addCard(sessionId, front, back) {
  const sets = await getStudySets();
  const setRec = sets.find((s) => s.sessionId === sessionId);
  if (!setRec) return null;
  const card = { id: uid(), front, back, ...initSchedule() };
  setRec.flashcards.push(card);
  await set(KEYS.STUDY_SETS, sets);
  return card;
}

export async function deleteCard(sessionId, cardId) {
  const sets = await getStudySets();
  const setRec = sets.find((s) => s.sessionId === sessionId);
  if (!setRec) return false;
  const before = setRec.flashcards.length;
  setRec.flashcards = setRec.flashcards.filter((c) => c.id !== cardId);
  await set(KEYS.STUDY_SETS, sets);
  return setRec.flashcards.length < before;
}

// --- Review log (insights + forgetting predictions) --------------------------
// reviewLog -> [{ cardId, sessionId, grade, at }] capped to the last 2,000.

export async function getReviewLog() {
  return get(KEYS.REVIEW_LOG, []);
}

export async function appendReviewLog(entry) {
  const log = await getReviewLog();
  log.push(entry);
  if (log.length > REVIEW_LOG_CAP) log.splice(0, log.length - REVIEW_LOG_CAP);
  await set(KEYS.REVIEW_LOG, log);
  return log;
}

// --- Backup / restore --------------------------------------------------------

/** Everything user-owned in one JSON-serializable object. */
export async function exportAll() {
  const obj = await new Promise((resolve) =>
    chrome.storage.local.get(null, (all) => resolve(all))
  );
  return obj;
}

/** Replace all local data from a backup object (as produced by exportAll). */
export async function importAll(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data[KEYS.STUDY_SETS])) {
    throw new Error("Not a Mafsar backup file.");
  }
  await new Promise((resolve) => chrome.storage.local.clear(() => resolve()));
  await new Promise((resolve) => chrome.storage.local.set(data, () => resolve()));
}

// --- Activity & streaks -----------------------------------------------------
// activity -> { "YYYY-MM-DD": reviewCount, ... }

function dayKey(d = new Date()) {
  // Local-date key (not UTC) so a "day" matches the user's calendar.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function getActivity() {
  return get(KEYS.ACTIVITY, {});
}

/** Record that `n` cards were reviewed today. */
export async function bumpActivity(n = 1) {
  const activity = await getActivity();
  const k = dayKey();
  activity[k] = (activity[k] || 0) + n;
  await set(KEYS.ACTIVITY, activity);
  return activity;
}

/** Consecutive-day streak ending today (or yesterday if nothing yet today). */
export function computeStreak(activity) {
  let streak = 0;
  const d = new Date();
  // If today has no activity yet, an existing streak can still be "alive"
  // from yesterday — start counting there.
  if (!activity[dayKey(d)]) d.setDate(d.getDate() - 1);
  while (activity[dayKey(d)]) {
    streak += 1;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

/** Which of the last 7 calendar days had activity (Mon..Sun-ish, oldest first). */
export function weekActivity(activity) {
  const out = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push({
      key: dayKey(d),
      label: ["S", "M", "T", "W", "T", "F", "S"][d.getDay()],
      count: activity[dayKey(d)] || 0,
      isToday: i === 0,
    });
  }
  return out;
}

export { uid, dayKey };
