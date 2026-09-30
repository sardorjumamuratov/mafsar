import { readRaw, saveRaw } from "./store.js";
import { backendLookupRatings, backendSendRating, backendDeleteRating } from "../sync/api.js";
import { formatCount as sharedFormatCount } from "../../shared/format.js";

// One store for every screen, keyed by the ROOT set id (a copy's rating
// belongs to the set it was copied from):
//   { [rootId]: { yourStars, ratingAvg, ratingCount, isGlobal, fetchedAt,
//                 pendingStars?: number | "delete", clientSetId? } }
// `clientSetId` is the learner's own set id, which the rating API needs (it
// resolves the root itself); it's kept so an offline change can be sent later.
let cache = {};
const CHANGED = "mafsar-ratings-changed";
const notify = () => { try { window.dispatchEvent(new Event(CHANGED)); } catch {} };

export async function loadRatingsStore() {
  const res = await readRaw(["ratings"]);
  if (res.ratings) cache = res.ratings;
}

async function saveRatingsStore() {
  await saveRaw({ ratings: cache });
}

export function getRating(rootId) {
  return cache[rootId] || { yourStars: null, ratingAvg: null, ratingCount: 0, isGlobal: false, fetchedAt: 0 };
}

/** The whole store, loaded from storage. Views index it by root id. */
export async function readRatings() {
  await loadRatingsStore();
  return cache;
}

const isOffline = (e) => e?.message === "Offline" || e?.message === "Failed to fetch" || (typeof navigator !== "undefined" && navigator.onLine === false);

async function write(rootId, clientSetId, stars) {
  if (!cache[rootId]) cache[rootId] = { yourStars: null, ratingAvg: null, ratingCount: 0, isGlobal: false, fetchedAt: 0 };
  const prev = { ...cache[rootId] };
  cache[rootId].yourStars = stars;
  cache[rootId].pendingStars = stars ?? "delete";
  cache[rootId].clientSetId = clientSetId;
  await saveRatingsStore();
  notify();

  try {
    const res = stars == null ? await backendDeleteRating(clientSetId) : await backendSendRating(clientSetId, stars);
    Object.assign(cache[rootId], { yourStars: res.yourStars ?? null, ratingAvg: res.avg ?? null, ratingCount: res.count ?? 0, fetchedAt: Date.now() });
    delete cache[rootId].pendingStars;
    await saveRatingsStore();
    notify();
  } catch (e) {
    // Offline: keep it pending, shown as saved, and send it on the next sync.
    if (isOffline(e)) return;
    cache[rootId] = prev;
    await saveRatingsStore();
    notify();
    throw e;
  }
}

export function rateSet(rootId, clientSetId, stars) {
  return write(rootId, clientSetId, stars);
}

export function clearRating(rootId, clientSetId = rootId) {
  return write(rootId, clientSetId, null);
}

/** Send ratings changed while offline. Called by syncNow and on `online`. */
export async function flushPendingRatings() {
  await loadRatingsStore();
  for (const rootId of Object.keys(cache)) {
    const entry = cache[rootId];
    const pending = entry.pendingStars;
    if (pending == null) continue;
    const clientSetId = entry.clientSetId || rootId;
    try {
      const res = pending === "delete" ? await backendDeleteRating(clientSetId) : await backendSendRating(clientSetId, pending);
      Object.assign(entry, { yourStars: res.yourStars ?? null, ratingAvg: res.avg ?? null, ratingCount: res.count ?? 0, fetchedAt: Date.now() });
      delete entry.pendingStars;
    } catch (e) {
      if (isOffline(e)) break;
      // The set is gone (404) or the value was refused: drop the change.
      delete entry.pendingStars;
    }
  }
  await saveRatingsStore();
  notify();
}

if (typeof window !== "undefined" && window.addEventListener) window.addEventListener("online", () => { flushPendingRatings().catch(() => {}); });

// Other people's ratings don't change the learner's own rows, so a sync never
// brings them; the lookup does. At most once a minute per set.
let lookupTimer = null;
export function refreshRatings(rootIds) {
  const now = Date.now();
  const due = [...new Set(rootIds || [])].filter((id) => id && (!cache[id] || now - (cache[id].fetchedAt || 0) > 60_000)).slice(0, 200);
  if (!due.length) return Promise.resolve();
  clearTimeout(lookupTimer);
  return new Promise((resolve) => {
    lookupTimer = setTimeout(async () => {
      try {
        const results = await backendLookupRatings(due);
        const t = Date.now();
        for (const [id, r] of Object.entries(results || {})) {
          const entry = cache[id] || (cache[id] = { yourStars: null, ratingAvg: null, ratingCount: 0, isGlobal: false, fetchedAt: 0 });
          // A pending local change wins over what the server knew before it.
          if (entry.pendingStars == null) entry.yourStars = r.yourStars ?? null;
          Object.assign(entry, { ratingAvg: r.ratingAvg ?? null, ratingCount: r.ratingCount ?? 0, isGlobal: !!r.isGlobal, fetchedAt: t });
        }
        await saveRatingsStore();
        notify();
      } catch {}
      resolve();
    }, 100);
  });
}
export const requestRatingsLookup = refreshRatings;

export function formatCount(count) {
  return sharedFormatCount(count);
}
