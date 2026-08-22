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

const DEFAULT_SETTINGS = { provider: "gemini", apiKey: "", model: "" };
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

/** Raw multi-key read (sync layer needs tombstones the UI filters out). */
export function readRaw(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (obj) => resolve(obj));
  });
}

export function nowISO() {
  return new Date().toISOString();
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
// UI getters hide tombstoned sets; the sync layer reads raw arrays instead.

export async function getSessions() {
  const [sessions, sets] = await Promise.all([
    get(KEYS.SESSIONS, []),
    get(KEYS.STUDY_SETS, []),
  ]);
  const deleted = new Set(sets.filter((s) => s.deleted).map((s) => s.sessionId));
  return sessions.filter((s) => !deleted.has(s.id));
}

export async function addSession(session) {
  const sessions = await getSessions();
  const record = { id: uid(), ...session };
  sessions.unshift(record);
  await set(KEYS.SESSIONS, sessions);
  return record;
}

export async function deleteSession(id) {
  // Tombstone, don't remove: the delete must propagate to other devices.
  const sets = await get(KEYS.STUDY_SETS, []);
  const setRec = sets.find((s) => s.sessionId === id);
  if (setRec) {
    setRec.deleted = true;
    setRec.updatedAt = nowISO();
    await set(KEYS.STUDY_SETS, sets);
  }
}

// --- Study sets -------------------------------------------------------------
// All writes stamp updatedAt (ISO) for last-write-wins sync. Deletes are
// tombstones (deleted:true), never removals, so they can propagate.

export async function getStudySets() {
  const sets = await get(KEYS.STUDY_SETS, []);
  return sets
    .filter((s) => !s.deleted)
    .map((s) => ({ ...s, flashcards: (s.flashcards || []).filter((c) => !c.deleted) }));
}

export async function getStudySetForSession(sessionId) {
  const sets = await get(KEYS.STUDY_SETS, []);
  const found = sets.find((s) => s.sessionId === sessionId);
  return found && !found.deleted ? found : null;
}

export async function saveStudySet(studySet) {
  const sets = await get(KEYS.STUDY_SETS, []);
  const idx = sets.findIndex((s) => s.sessionId === studySet.sessionId);
  const record = { id: studySet.id || uid(), updatedAt: nowISO(), ...studySet };
  // Stamp any unsynced children so LWW comparisons always have a timestamp.
  for (const c of record.flashcards || []) c.updatedAt ||= record.updatedAt;
  for (const q of record.quiz || []) q.updatedAt ||= record.updatedAt;
  if (idx >= 0) sets[idx] = record;
  else sets.unshift(record);
  await set(KEYS.STUDY_SETS, sets);
  return record;
}

export async function updateCard(sessionId, cardId, patch) {
  const sets = await get(KEYS.STUDY_SETS, []);
  const setRec = sets.find((s) => s.sessionId === sessionId);
  if (!setRec) return null;
  const card = setRec.flashcards.find((c) => c.id === cardId);
  if (!card) return null;
  Object.assign(card, patch, { updatedAt: nowISO() });
  setRec.updatedAt = nowISO();
  await set(KEYS.STUDY_SETS, sets);
  return card;
}

/** Set or clear (null) the exam date for a set's cards. epoch ms or null. */
export async function setExamDate(sessionId, examDate) {
  const sets = await get(KEYS.STUDY_SETS, []);
  const setRec = sets.find((s) => s.sessionId === sessionId);
  if (!setRec) return null;
  setRec.examDate = examDate || null;
  setRec.updatedAt = nowISO();
  await set(KEYS.STUDY_SETS, sets);
  return setRec;
}

export async function addCard(sessionId, front, back) {
  const sets = await get(KEYS.STUDY_SETS, []);
  const setRec = sets.find((s) => s.sessionId === sessionId);
  if (!setRec) return null;
  const card = { id: uid(), front, back, updatedAt: nowISO(), ...initSchedule() };
  setRec.flashcards.push(card);
  setRec.updatedAt = nowISO();
  await set(KEYS.STUDY_SETS, sets);
  return card;
}

export async function deleteCard(sessionId, cardId) {
  const sets = await get(KEYS.STUDY_SETS, []);
  const setRec = sets.find((s) => s.sessionId === sessionId);
  if (!setRec) return false;
  const card = setRec.flashcards.find((c) => c.id === cardId);
  if (!card) return false;
  card.deleted = true; // tombstone so the delete syncs
  card.updatedAt = nowISO();
  setRec.updatedAt = nowISO();
  await set(KEYS.STUDY_SETS, sets);
  return true;
}

// --- Review log (insights + forgetting predictions) --------------------------
// reviewLog -> [{ id, cardId, sessionId?, grade, prevInterval, newInterval,
//                 reviewedAt }] capped to the last 2,000. Server-shaped so the
// sync layer can push it verbatim.

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
