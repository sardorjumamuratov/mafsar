// Thin wrapper over chrome.storage.local. Everything is stored locally on the
// user's machine — no sync, no server.

import { initSchedule } from "../../shared/srs.js";
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
    .map((s) => ({
      ...s,
      flashcards: (s.flashcards || []).filter((c) => !c.deleted),
      // Hide tombstoned quiz questions too — the sync layer can mark a single
      // quiz row deleted (schema + applyServer support it), and a UI getter
      // that hid deleted cards but not deleted quiz would resurface them.
      quiz: (s.quiz || []).filter((q) => !q.deleted),
    }));
}

// --- pure selectors over an already-loaded raw read ---------------------------
// Same tombstone rules as the async getters above, but with no I/O, so a caller
// that has done one multi-key read can derive everything without going back to
// chrome.storage. Keep these and the getters in step: if a tombstone rule
// changes in one, change it in the other.

/** @param {any} raw result of readRaw([...]) */
export function selectStudySets(raw) {
  const sets = raw?.[KEYS.STUDY_SETS] || [];
  return sets
    .filter((s) => !s.deleted)
    .map((s) => ({
      ...s,
      flashcards: (s.flashcards || []).filter((c) => !c.deleted),
      quiz: (s.quiz || []).filter((q) => !q.deleted),
    }));
}

/** @param {any} raw result of readRaw([...]) */
export function selectSessions(raw) {
  const sessions = raw?.[KEYS.SESSIONS] || [];
  const sets = raw?.[KEYS.STUDY_SETS] || [];
  const deleted = new Set(sets.filter((s) => s.deleted).map((s) => s.sessionId));
  return sessions.filter((s) => !deleted.has(s.id));
}

/** @param {any} raw result of readRaw([...]) */
export function selectSettings(raw) {
  return { ...DEFAULT_SETTINGS, ...(raw?.[KEYS.SETTINGS] || {}) };
}

/** All five keys the panel's bundle() needs, in one read. */
export const BUNDLE_KEYS = [
  KEYS.SETTINGS,
  KEYS.SESSIONS,
  KEYS.STUDY_SETS,
  KEYS.ACTIVITY,
  KEYS.REVIEW_LOG,
];

export async function getStudySetForSession(sessionId) {
  const sets = await get(KEYS.STUDY_SETS, []);
  const found = sets.find((s) => s.sessionId === sessionId);
  return found && !found.deleted ? found : null;
}


function syncChainLinks(set) {
  if (set.mode !== "medicine" || !set.chains) return;
  
  const LABELS = { cause: "Cause", mechanism: "Mechanism", physiological: "Physiological change", symptoms: "Symptoms", signs: "Signs", tests: "Tests", diagnosis: "Diagnosis", treatment: "Treatment" };
  const TEMPLATE = ["cause", "mechanism", "physiological", "symptoms", "signs", "tests", "diagnosis", "treatment"];

  const validLinks = new Map();

  for (const ch of set.chains) {
    if (ch.deleted) continue;
    let prev = null;
    for (const key of TEMPLATE) {
      const step = (ch.steps || []).find(s => s.key === key && !s.deleted);
      if (step && step.statement) {
        if (prev) {
          const id = `chainlink:${ch.id}:${prev.key}:${key}`;
          const breadcrumb = `${set.title || "Condition"} � ${LABELS[prev.key]} > ${LABELS[key]}`;
          
          if (step.why) {
            validLinks.set(id, {
              front: `${breadcrumb} (Why?)\n\nWhy does ${prev.statement.toLowerCase()} lead to ${step.statement.toLowerCase()}?`,
              back: step.why
            });
          } else {
            validLinks.set(id, {
              front: `${breadcrumb}\n\n${prev.statement} > ?`,
              back: step.statement
            });
          }
        }
        prev = step;
      } else {
        prev = null;
      }
    }
  }

  set.flashcards = set.flashcards || [];
  
  for (const card of set.flashcards) {
    if (card.id.startsWith("chainlink:") && !card.deleted) {
      if (!validLinks.has(card.id)) {
        card.deleted = true;
        card.updatedAt = nowISO();
      }
    }
  }

  let maxFutureMs = Date.now();
  for (const card of set.flashcards) {
    if (card.id.startsWith("chainlink:") && !card.deleted && !card.state) {
      const ms = card.dueDate ? new Date(card.dueDate).getTime() : Date.now();
      if (ms > maxFutureMs) maxFutureMs = ms;
    }
  }

  const maxDayStr = new Date(maxFutureMs).toDateString();
  let countOnMaxDay = 0;
  for (const card of set.flashcards) {
    if (card.id.startsWith("chainlink:") && !card.deleted && !card.state) {
      const ms = card.dueDate ? new Date(card.dueDate).getTime() : Date.now();
      if (new Date(ms).toDateString() === maxDayStr) countOnMaxDay++;
    }
  }
  
  let currentMs = maxFutureMs;

  for (const [id, { front, back }] of validLinks.entries()) {
    const existing = set.flashcards.find(c => c.id === id);
    if (existing) {
      if (existing.deleted) {
         existing.deleted = false;
         existing.updatedAt = nowISO();
      }
      
      const changed = existing.front !== front || existing.back !== back;
      if (changed) {
        const substantial = Math.abs((existing.front || "").length - front.length) > 10 || Math.abs((existing.back || "").length - back.length) > 10 || existing.back !== back;
        
        existing.front = front;
        existing.back = back;
        existing.updatedAt = nowISO();
        
        if (substantial) {
          delete existing.easiness;
          delete existing.interval;
          delete existing.repetitions;
          delete existing.lapses;
          delete existing.state;
          delete existing.lastReview;
          delete existing.difficulty;
          delete existing.stability;
          
          if (countOnMaxDay >= 3) {
            currentMs += 86400 * 1000;
            countOnMaxDay = 0;
          }
          existing.dueDate = currentMs > Date.now() + 1000 ? new Date(currentMs).toISOString() : null;
          countOnMaxDay++;
        }
      }
    } else {
      if (countOnMaxDay >= 3) {
        currentMs += 86400 * 1000;
        countOnMaxDay = 0;
      }
      const dueDate = currentMs > Date.now() + 1000 ? new Date(currentMs).toISOString() : null;
      countOnMaxDay++;
      
      set.flashcards.push({
        id,
        front,
        back,
        dueDate,
        updatedAt: nowISO()
      });
    }
  }
}

export async function saveStudySet(studySet) {
  syncChainLinks(studySet);
  const sets = await get(KEYS.STUDY_SETS, []);
  const idx = sets.findIndex((s) => s.sessionId === studySet.sessionId);
  // Spread first, then force id + a fresh updatedAt LAST: re-saving a record
  // that already carries an updatedAt (e.g. the SUMMARIZE/blurb handlers pass
  // the stored set straight back) must still bump the stamp, or last-write-wins
  // sync can't tell the row changed.
  const record = { ...studySet, id: studySet.id || uid(), updatedAt: nowISO() };
  // Stamp any unsynced children so LWW comparisons always have a timestamp.
  for (const c of record.flashcards || []) c.updatedAt ||= record.updatedAt;
  for (const q of record.quiz || []) q.updatedAt ||= record.updatedAt;
  for (const ch of record.chains || []) {
    ch.updatedAt ||= record.updatedAt;
    for (const st of ch.steps || []) st.updatedAt ||= record.updatedAt;
  }
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

export { dayKey, computeStreak, weekActivity } from "../../shared/streak.js";
import { dayKey } from "../../shared/streak.js";

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

export { uid };
