import { readRaw, saveRaw } from "./store.js";
import { backendLookupRatings, backendSendRating, backendDeleteRating } from "../sync/api.js";
import { syncNow } from "../sync/sync.js";

// { [rootId]: { yourStars, ratingAvg, ratingCount, isGlobal, fetchedAt, pendingStars: null|number|"delete" } }
let cache = {};

export async function loadRatingsStore() {
  const res = await readRaw(["ratings"]);
  const data = res.ratings;
  if (data) cache = data;
}

async function saveRatingsStore() {
  await saveRaw({ ratings: cache });
}

export function getRating(rootId) {
  return cache[rootId] || { yourStars: null, ratingAvg: null, ratingCount: 0, isGlobal: false, fetchedAt: 0 };
}

let lookupTimeout = null;
export function requestRatingsLookup(ids) {
  if (ids.length === 0) return;
  const now = Date.now();
  const toFetch = ids.filter(id => !cache[id] || (now - cache[id].fetchedAt > 60000));
  if (toFetch.length === 0) return;

  if (lookupTimeout) clearTimeout(lookupTimeout);
  lookupTimeout = setTimeout(async () => {
    try {
      const results = await backendLookupRatings(toFetch);
      const t = Date.now();
      for (const id in results) {
        if (!cache[id]) cache[id] = {};
        const r = results[id];
        cache[id].yourStars = r.yourStars;
        cache[id].ratingAvg = r.ratingAvg;
        cache[id].ratingCount = r.ratingCount;
        cache[id].isGlobal = r.isGlobal;
        cache[id].fetchedAt = t;
      }
      await saveRatingsStore();
      window.dispatchEvent(new Event("mafsar-ratings-changed"));
    } catch (e) {
      console.error("Lookup ratings failed", e);
    }
  }, 100); // debounce slightly
}

export async function rateSet(rootId, clientSetId, stars) {
  if (!cache[rootId]) cache[rootId] = { ratingAvg: null, ratingCount: 0, isGlobal: false, fetchedAt: 0 };
  
  const prev = { ...cache[rootId] };
  
  cache[rootId].yourStars = stars;
  cache[rootId].pendingStars = stars;
  await saveRatingsStore();
  window.dispatchEvent(new Event("mafsar-ratings-changed"));

  try {
    const res = await backendSendRating(clientSetId, stars);
    cache[rootId].yourStars = res.yourStars;
    cache[rootId].ratingAvg = res.avg;
    cache[rootId].ratingCount = res.count;
    delete cache[rootId].pendingStars;
    cache[rootId].fetchedAt = Date.now();
    await saveRatingsStore();
    window.dispatchEvent(new Event("mafsar-ratings-changed"));
  } catch (e) {
    if (e.message !== "Offline") {
      // rollback if not offline
      cache[rootId] = prev;
      await saveRatingsStore();
      window.dispatchEvent(new Event("mafsar-ratings-changed"));
      throw e;
    }
  }
}

export async function clearRating(rootId, clientSetId) {
  if (!cache[rootId]) return;
  
  const prev = { ...cache[rootId] };
  cache[rootId].yourStars = null;
  cache[rootId].pendingStars = "delete";
  await saveRatingsStore();
  window.dispatchEvent(new Event("mafsar-ratings-changed"));

  try {
    const res = await backendDeleteRating(clientSetId);
    cache[rootId].yourStars = res.yourStars;
    cache[rootId].ratingAvg = res.avg;
    cache[rootId].ratingCount = res.count;
    delete cache[rootId].pendingStars;
    cache[rootId].fetchedAt = Date.now();
    await saveRatingsStore();
    window.dispatchEvent(new Event("mafsar-ratings-changed"));
  } catch (e) {
    if (e.message !== "Offline") {
      // rollback
      cache[rootId] = prev;
      await saveRatingsStore();
      window.dispatchEvent(new Event("mafsar-ratings-changed"));
      throw e;
    }
  }
}

export async function flushPendingRatings() {
  for (const rootId in cache) {
    const pending = cache[rootId].pendingStars;
    if (pending) {
      try {
        if (pending === "delete") {
          const res = await backendDeleteRating(rootId);
          cache[rootId].yourStars = res.yourStars;
          cache[rootId].ratingAvg = res.avg;
          cache[rootId].ratingCount = res.count;
        } else {
          const res = await backendSendRating(rootId, pending);
          cache[rootId].yourStars = res.yourStars;
          cache[rootId].ratingAvg = res.avg;
          cache[rootId].ratingCount = res.count;
        }
        delete cache[rootId].pendingStars;
        cache[rootId].fetchedAt = Date.now();
      } catch (e) {
        if (e.message === "Offline") return;
        if (e.status === 404) {
          delete cache[rootId].pendingStars;
        }
      }
    }
  }
  await saveRatingsStore();
  window.dispatchEvent(new Event("mafsar-ratings-changed"));
}

if (typeof window !== "undefined" && window.addEventListener) window.addEventListener("online", flushPendingRatings);
export function formatCount(count) {
  if (count < 1000) return count.toString();
  if (count < 1000000) return (count / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return (count / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
}

export function renderStarsGroup(rootId, clientSetId, cacheData, isDisplayOnly) {
  const yourStars = cacheData.yourStars;
  const avg = cacheData.ratingAvg;
  const count = cacheData.ratingCount;
  const global = cacheData.isGlobal;
  
  let html = `<div style="display:flex;gap:8px;align-items:center;margin-left:-6px">`;
  html += `<div class="rating-group" role="radiogroup" aria-label="Rate this set" data-root="${rootId}" data-client="${clientSetId}" style="display:flex">`;
  
  for (let i = 1; i <= 5; i++) {
    const filled = yourStars && i <= yourStars;
    const color = filled ? "var(--warm, #f0c75e)" : "var(--faint, #6d7c78)";
    const path = `M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z`;
    const svg = `<svg class="ic" viewBox="0 0 24 24" style="width:22px;height:22px;stroke:${color};stroke-width:1.7;stroke-linejoin:round;fill:${filled ? color : 'none'}"><path d="${path}" /></svg>`;
    
    html += `<button type="button" class="star-btn" role="radio" aria-checked="${yourStars === i}" aria-label="${i} star${i>1?'s':''}" data-val="${i}" style="width:34px;height:34px;display:flex;align-items:center;justify-content:center;background:none;border:none;padding:0;cursor:pointer"${isDisplayOnly ? ' disabled' : ''}>${svg}</button>`;
  }
  html += `</div>`;
  
  let text = "";
  if (!global && !yourStars) text = "Tap to rate";
  else if (!global && yourStars) text = `Your rating � ${yourStars}`;
  else if (global && count === 0) text = "No ratings yet";
  else text = `Avg ${avg ? avg.toFixed(1) : ''} � ${formatCount(count)} rating(s)`;
  
  html += `<div style="font-size:13px;color:var(--muted)">${text}</div></div>`;
  return html;
}

export function renderMetaSuffix(cacheData) {
  if (!cacheData || cacheData.ratingCount === 0 && !cacheData.yourStars) return cacheData?.isGlobal ? ` � ?? Global` : "";
  
  const avg = cacheData.ratingAvg ? cacheData.ratingAvg.toFixed(1) : (cacheData.yourStars ? cacheData.yourStars.toFixed(1) : "");
  let suffix = "";
  if (!cacheData.isGlobal) {
    if (cacheData.yourStars) suffix = " yours";
  } else {
    suffix = ` (${formatCount(cacheData.ratingCount)})`;
  }
  
  const star = `<svg viewBox="0 0 24 24" style="width:12px;height:12px;display:inline-block;vertical-align:-2px;fill:#f0c75e"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/></svg>`;
  
  let res = ` � ${star} ${avg}${suffix}`;
  if (cacheData.isGlobal) {
    res += ` � <svg viewBox="0 0 24 24" style="width:12px;height:12px;display:inline-block;vertical-align:-2px;stroke:currentColor;stroke-width:2.2;fill:none"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> Global`;
  }
  return res;
}
