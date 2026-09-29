import { getActiveAccountId } from "./store.js";
import { fetchAuth } from "../sync/auth.js";

const RATINGS_KEY = "ratings";

function scopedKey(accountId, key) {
  return `user:${accountId}:${key}`;
}

async function getRatings() {
  const id = await getActiveAccountId();
  if (!id) return {};
  const data = await new Promise((resolve) => chrome.storage.local.get(scopedKey(id, RATINGS_KEY), resolve));
  return data[scopedKey(id, RATINGS_KEY)] || {};
}

async function setRatings(ratings) {
  const id = await getActiveAccountId();
  if (!id) return;
  await new Promise((resolve) => chrome.storage.local.set({ [scopedKey(id, RATINGS_KEY)]: ratings }, () => resolve()));
}

let lookupTimeout = null;
let lastLookup = 0;

export async function readRatings() {
  return getRatings();
}

/** Optimistically set a rating and send to the server. */
export async function setRating(setId, stars) {
  const old = await getRatings();
  const state = old[setId] || { yourStars: null, ratingAvg: null, ratingCount: 0, isGlobal: false };
  const backup = { ...state };
  
  await setRatings({
    ...old,
    [setId]: {
      ...state,
      yourStars: stars,
      pending: true
    }
  });
  window.dispatchEvent(new CustomEvent("ratings-updated"));
  
  // Call API
  try {
    const res = await fetchAuth(`/v1/sets/${setId}/rating`, {
      method: "PUT",
      body: JSON.stringify({ stars })
    });
    if (!res.ok) throw new Error("Failed");
    const json = await res.json();
    const fresh = await getRatings();
    await setRatings({
      ...fresh,
      [setId]: {
        ...fresh[setId],
        yourStars: json.yourStars,
        ratingAvg: json.avg,
        ratingCount: json.count,
        pending: false
      }
    });
    return true;
  } catch (e) {
    // Rollback
    const fresh = await getRatings();
    if (fresh[setId]?.pending) {
      await setRatings({ ...fresh, [setId]: backup });
      window.dispatchEvent(new CustomEvent("ratings-updated"));
    }
    throw e;
  }
}

export async function clearRating(setId) {
  const old = await getRatings();
  const state = old[setId] || { yourStars: null, ratingAvg: null, ratingCount: 0, isGlobal: false };
  const backup = { ...state };
  
  await setRatings({
    ...old,
    [setId]: {
      ...state,
      yourStars: null,
      pendingClear: true
    }
  });
  window.dispatchEvent(new CustomEvent("ratings-updated"));
  
  try {
    const res = await fetchAuth(`/v1/sets/${setId}/rating`, {
      method: "DELETE"
    });
    if (!res.ok) throw new Error("Failed");
    const json = await res.json();
    const fresh = await getRatings();
    await setRatings({
      ...fresh,
      [setId]: {
        ...fresh[setId],
        yourStars: null,
        ratingAvg: json.avg,
        ratingCount: json.count,
        pendingClear: false
      }
    });
    return true;
  } catch (e) {
    const fresh = await getRatings();
    if (fresh[setId]?.pendingClear) {
      await setRatings({ ...fresh, [setId]: backup });
      window.dispatchEvent(new CustomEvent("ratings-updated"));
    }
    throw e;
  }
}

export async function flushPendingRatings() {
  const ratings = await getRatings();
  for (const [id, r] of Object.entries(ratings)) {
    if (r.pending) {
      await setRating(id, r.yourStars).catch(() => {});
    } else if (r.pendingClear) {
      await clearRating(id).catch(() => {});
    }
  }
}

export async function refreshRatings(visibleSetIds) {
  if (!visibleSetIds || visibleSetIds.length === 0) return;
  const now = Date.now();
  if (now - lastLookup < 60000) return;
  
  if (lookupTimeout) clearTimeout(lookupTimeout);
  lookupTimeout = setTimeout(async () => {
    lastLookup = Date.now();
    try {
      const res = await fetchAuth("/v1/ratings/lookup", {
        method: "POST",
        body: JSON.stringify({ ids: visibleSetIds.slice(0, 200) })
      });
      if (!res.ok) return;
      const data = await res.json();
      
      const old = await getRatings();
      const next = { ...old };
      for (const [id, r] of Object.entries(data)) {
        if (!next[id] || (!next[id].pending && !next[id].pendingClear)) {
          next[id] = r;
        }
      }
      await setRatings(next);
      window.dispatchEvent(new CustomEvent("ratings-updated"));
    } catch (e) {}
  }, 100);
}
