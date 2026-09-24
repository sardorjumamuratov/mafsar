// Thin wrapper over chrome.storage.local. Everything is stored locally on the
// user's machine — no sync, no server.

import { initSchedule } from "../../shared/srs.js";
import { syncLinkCards } from "./chain-links.js";
//
// Shape:
//   settings        -> {}
//   sessions        -> Session[]          (captured conversations)
//   studySets       -> StudySet[]         (generated cards, keyed by sessionId)
// A StudySet card carries its own SM-2 scheduling fields (see srs.js).

export const KEYS = {
  SETTINGS: "settings",
  SESSIONS: "sessions",
  STUDY_SETS: "studySets",
  LAST_SYNC: "lastSync",
  ACTIVITY: "activity",
  REVIEW_LOG: "reviewLog",
};

const DEFAULT_SETTINGS = {};
const REVIEW_LOG_CAP = 2000;

// --- Per-account partitions --------------------------------------------------
// Study data is stored under "<accountId>_<key>", so two accounts on one device
// never see or upload each other's sets. Settings stay device-wide.
//
// The id is cached per context (panel and service worker are separate), so a
// storage listener drops the cache when another context switches account —
// without it the worker would keep filing captures under the previous account.

const DATA_KEYS = ["sessions", "studySets", "activity", "reviewLog", "lastSync"];
/** Data captured before anyone signed in; the next sign-in adopts it. */
const NO_ACCOUNT = "local";

let activeAccountIdCache = null;

try {
  chrome.storage.onChanged?.addListener((changes, area) => {
    if (area === "local" && changes.activeAccountId) activeAccountIdCache = changes.activeAccountId.newValue || null;
  });
} catch {
  /* no chrome.storage in tests that don't need it */
}

export async function getActiveAccountId() {
  if (activeAccountIdCache) return activeAccountIdCache;
  const known = await new Promise((resolve) => chrome.storage.local.get(["activeAccountId", "auth"], resolve));
  if (known.activeAccountId) {
    activeAccountIdCache = known.activeAccountId;
    return activeAccountIdCache;
  }
  const id = known.auth?.user?.id || NO_ACCOUNT;
  // First run on this build: anything under the old flat keys belongs to
  // whoever is signed in now. Read everything once, then never again.
  const all = await new Promise((resolve) => chrome.storage.local.get(null, resolve));
  const updates = { activeAccountId: id };
  const stale = [];
  for (const k of DATA_KEYS) {
    if (all[k] !== undefined) {
      updates[scopedKey(id, k)] = all[k];
      stale.push(k);
    }
  }
  await new Promise((resolve) => chrome.storage.local.set(updates, () => resolve()));
  if (stale.length) await new Promise((resolve) => chrome.storage.local.remove(stale, () => resolve()));
  activeAccountIdCache = id;
  return id;
}

/**
 * Hand the device to `newId`. Anything captured before a sign-in (or migrated
 * while signed out) is adopted by the first account to claim it, rather than
 * being stranded under an id nobody signs in as.
 */
export async function switchActiveAccount(newId) {
  const previous = activeAccountIdCache;
  activeAccountIdCache = newId;
  await new Promise((resolve) => chrome.storage.local.set({ activeAccountId: newId }, () => resolve()));
  if (newId && newId !== NO_ACCOUNT && previous !== newId) await adoptOrphanData(newId);
}

/** Move the no-account partition into `id`, but never over data it already has. */
async function adoptOrphanData(id) {
  const orphanKeys = DATA_KEYS.map((k) => scopedKey(NO_ACCOUNT, k));
  const mineKeys = DATA_KEYS.map((k) => scopedKey(id, k));
  const found = await new Promise((resolve) => chrome.storage.local.get([...orphanKeys, ...mineKeys], resolve));
  const moved = {};
  const drop = [];
  for (const k of DATA_KEYS) {
    const from = scopedKey(NO_ACCOUNT, k);
    if (found[from] === undefined) continue;
    drop.push(from);
    if (found[scopedKey(id, k)] === undefined) moved[scopedKey(id, k)] = found[from];
  }
  if (!drop.length) return;
  // A fresh account inherits the sets but not the old sync cursor, or the
  // server would be told those rows were already pushed.
  delete moved[scopedKey(id, KEYS.LAST_SYNC)];
  if (Object.keys(moved).length) await new Promise((resolve) => chrome.storage.local.set(moved, () => resolve()));
  await new Promise((resolve) => chrome.storage.local.remove(drop, () => resolve()));
}

function scopedKey(id, k) {
  return k === KEYS.SETTINGS ? k : `${id}_${k}`;
}

export async function getLastSync() {
  return get(KEYS.LAST_SYNC, null);
}

export async function setLastSync(time) {
  return set(KEYS.LAST_SYNC, time);
}

/** Drop everything the signed-in account owns here. Other accounts are untouched. */
export async function deleteActiveAccountData() {
  const id = await getActiveAccountId();
  await new Promise((resolve) => chrome.storage.local.remove(DATA_KEYS.map((k) => scopedKey(id, k)), () => resolve()));
  activeAccountIdCache = null;
}

function get(key, fallback) {
  return getActiveAccountId().then(id => {
    return new Promise((resolve) => {
      const sk = scopedKey(id, key);
      chrome.storage.local.get(sk, (obj) => resolve(obj[sk] ?? fallback));
    });
  });
}


export async function evictToFreeSpace() {
  const bytes = await new Promise(r => chrome.storage.local.getBytesInUse(null, r));
  if (bytes < 4_500_000) return false;

  const all = await new Promise(r => chrome.storage.local.get(null, r));
  const activeId = await getActiveAccountId();
  const accounts = new Set();
  for (const k of Object.keys(all)) {
    if (k.includes("_")) accounts.add(k.split("_")[0]);
  }
  
  let freedSomething = false;
  for (const acc of accounts) {
    if (acc === activeId || acc === "local") continue;
    
    const lastSync = all[`${acc}_${KEYS.LAST_SYNC}`] || "";
    if (!lastSync) continue; // Can't prove server has it
    
    const sets = all[`${acc}_${KEYS.STUDY_SETS}`] || [];
    const unsyncedSets = sets.some(s => (s.updatedAt || "") > lastSync);
    if (unsyncedSets) continue;
    
    const reviews = all[`${acc}_${KEYS.REVIEW_LOG}`] || [];
    const unsyncedReviews = reviews.some(r => (r.reviewedAt || "") > lastSync);
    if (unsyncedReviews) continue;
    
    const drop = Object.values(KEYS).map(k => `${acc}_${k}`);
    await new Promise(r => chrome.storage.local.remove(drop, r));
    freedSomething = true;
    
    const newBytes = await new Promise(r => chrome.storage.local.getBytesInUse(null, r));
    if (newBytes < 4_500_000) return true;
  }
  return freedSomething;
}

function set(key, value) {
  return getActiveAccountId().then(id => {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [scopedKey(id, key)]: value }, () => resolve());
    });
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
  let changed = false;
  if ("provider" in s) { delete s.provider; changed = true; }
  if ("apiKey" in s) { delete s.apiKey; changed = true; }
  if ("model" in s) { delete s.model; changed = true; }
  if (changed) await set(KEYS.SETTINGS, s);
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



export async function saveStudySet(studySet) {
  // Medicine sets: keep one review card per chain link in step with the chains.
  studySet.flashcards = syncLinkCards(studySet);
  const sets = await get(KEYS.STUDY_SETS, []);
  const idx = sets.findIndex((s) => s.sessionId === studySet.sessionId);

  const existing = idx >= 0 ? sets[idx] : {};

  // Spread first, then force id + a fresh updatedAt LAST: re-saving a record
  // that already carries an updatedAt (e.g. the SUMMARIZE/blurb handlers pass
  // the stored set straight back) must still bump the stamp, or last-write-wins
  // sync can't tell the row changed.
  const record = { ...existing, ...studySet, id: studySet.id || existing.id || uid(), updatedAt: nowISO() };
  
  const mergeArrays = (oldArr = [], newArr = []) => {
    const byId = new Map(oldArr.map((x) => [x.id, x]));
    for (const item of newArr) {
      const ex = byId.get(item.id);
      if (!ex || (item.updatedAt || "") >= (ex.updatedAt || "")) {
        byId.set(item.id, item);
      }
    }
    return Array.from(byId.values());
  };

  record.flashcards = mergeArrays(existing.flashcards, record.flashcards);
  record.quiz = mergeArrays(existing.quiz, record.quiz);
  record.chains = mergeArrays(existing.chains, record.chains);

  // Stamp any unsynced children so LWW comparisons always have a timestamp.
  for (const c of record.flashcards || []) c.updatedAt ||= record.updatedAt;
  for (const q of record.quiz || []) q.updatedAt ||= record.updatedAt;
  for (const ch of record.chains || []) {
    ch.updatedAt ||= record.updatedAt;
    ch.steps = mergeArrays((existing.chains || []).find(x => x.id === ch.id)?.steps, ch.steps);
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
  const lastSync = await getLastSync() || "";
    // Keep all unsynced rows (they can't cost data), and cap only the synced ones.
    const unsynced = log.filter(r => (r.reviewedAt || "") > lastSync);
    const synced = log.filter(r => (r.reviewedAt || "") <= lastSync);
    if (synced.length > REVIEW_LOG_CAP) synced.splice(0, synced.length - REVIEW_LOG_CAP);
    log.length = 0;
    log.push(...synced, ...unsynced);
  await set(KEYS.REVIEW_LOG, log);
  return log;
}

// --- Backup / restore --------------------------------------------------------

/** Raw multi-key read (the sync layer needs the tombstones the UI filters out). */
export async function readRaw(keys) {
  const id = await getActiveAccountId();
  const actualKeys = keys.map(k => scopedKey(id, k));
  return new Promise((resolve) => {
    chrome.storage.local.get(actualKeys, (obj) => {
      const res = {};
      for (let i = 0; i < keys.length; i++) {
        res[keys[i]] = obj[actualKeys[i]];
      }
      resolve(res);
    });
  });
}

/** Raw multi-key write into the active account's partition. */
export async function saveRaw(patch) {
  const id = await getActiveAccountId();
  const actualPatch = {};
  for (const [k, v] of Object.entries(patch)) {
    actualPatch[scopedKey(id, k)] = v;
  }
  return new Promise(resolve => chrome.storage.local.set(actualPatch, () => resolve()));
}

/**
 * Everything the signed-in account owns, as a JSON-serializable object. Never
 * the auth record: a backup file is shared, and it would carry live tokens.
 */
export async function exportAll() {
  return await readRaw([KEYS.SESSIONS, KEYS.STUDY_SETS, KEYS.ACTIVITY, KEYS.REVIEW_LOG]);
}

/** Replace all local data from a backup object (as produced by exportAll). */
export async function importAll(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data[KEYS.STUDY_SETS])) {
    throw new Error("Not a Mafsar backup file.");
  }
  await saveRaw({
    [KEYS.SESSIONS]: data[KEYS.SESSIONS] || [],
    [KEYS.STUDY_SETS]: data[KEYS.STUDY_SETS] || [],
    [KEYS.ACTIVITY]: data[KEYS.ACTIVITY] || {},
    [KEYS.REVIEW_LOG]: data[KEYS.REVIEW_LOG] || []
  });
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

export async function updateStudySet(sessionId, patch) {
  const sets = await get(KEYS.STUDY_SETS, []);
  const idx = sets.findIndex((s) => s.sessionId === sessionId);
  if (idx < 0) return null;
  const existing = sets[idx];
  const record = { ...existing, ...patch, updatedAt: nowISO() };
  sets[idx] = record;
  await set(KEYS.STUDY_SETS, sets);
  return record;
}
