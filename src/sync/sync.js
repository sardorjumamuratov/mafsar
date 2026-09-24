// Sync orchestrator: push local changes, pull server changes, both
// last-write-wins. No-ops when signed out or offline — local data is the
// source of truth and never blocked on the network.

import { readRaw, saveRaw, uid, getLastSync, setLastSync, KEYS } from "../storage/store.js";
import { getAuth, setAuth, authedFetch } from "./auth.js";
import { toServer, applyServer } from "../../shared/sync-map.js";

let syncing = false;

function writeAll(state) {
  return saveRaw({
    sessions: state.sessions,
    studySets: state.studySets,
    activity: state.activity,
    reviewLog: state.reviewLog,
  });
}

function chunk(arr, size) {
  const res = [];
  for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
  return res;
}

/**
 * Run one sync round-trip. Returns { pushed, pulled, serverTime } or
 * { skipped: reason } when there's nothing to do.
 */
export async function syncNow() {
  if (syncing) return { skipped: "in-progress" };
  const auth = await getAuth();
  if (!auth?.accessToken) return { skipped: "signed-out" };
  // Both the rows and the cursor come from this account's partition, so a
  // second account on the same device can't be pushed under these tokens.
  const lastSync = await getLastSync();
  syncing = true;
  try {
    const raw = await readRaw([KEYS.SESSIONS, KEYS.STUDY_SETS, KEYS.ACTIVITY, KEYS.REVIEW_LOG]);
    let local = {
      sessions: raw.sessions || [],
      studySets: raw.studySets || [],
      activity: raw.activity || {},
      reviewLog: raw.reviewLog || [],
    };
    const payload = toServer(local, lastSync);
    
    // Chunk payload arrays
    const CHUNK_SIZE = 500;
    const chunkedSets = chunk(payload.sets, CHUNK_SIZE) || [[]];
    const chunkedCards = chunk(payload.cards, CHUNK_SIZE) || [[]];
    const chunkedQuiz = chunk(payload.quiz, CHUNK_SIZE) || [[]];
    const chunkedReviews = chunk(payload.reviews, CHUNK_SIZE) || [[]];
    const chunkedActivity = chunk(payload.activity, CHUNK_SIZE) || [[]];
    const chunkedChains = chunk(payload.chains, CHUNK_SIZE) || [[]];
    const chunkedChainSteps = chunk(payload.chainSteps, CHUNK_SIZE) || [[]];
    
    const maxChunks = Math.max(1, chunkedSets.length, chunkedCards.length, chunkedQuiz.length, chunkedReviews.length, chunkedActivity.length, chunkedChains.length, chunkedChainSteps.length);
    
    let totalPushed = 0;
    let totalPulled = 0;
    let currentSince = lastSync || undefined;
    let finalServerTime = null;

    for (let i = 0; i < maxChunks; i++) {
      const cSets = chunkedSets[i] || [];
      const cCards = chunkedCards[i] || [];
      const cQuiz = chunkedQuiz[i] || [];
      const cReviews = chunkedReviews[i] || [];
      const cActivity = chunkedActivity[i] || [];
      const cChains = chunkedChains[i] || [];
      const cChainSteps = chunkedChainSteps[i] || [];
      
      const res = await authedFetch("/v1/sync", {
        method: "POST",
        body: JSON.stringify({ since: currentSince, sets: cSets, cards: cCards, quiz: cQuiz, reviews: cReviews, activity: cActivity, chains: cChains, chainSteps: cChainSteps }),
      });
      if (!res.ok) throw new Error("sync failed (${res.status})");
      const resp = await res.json();

      local = applyServer(resp, local, uid);
      finalServerTime = resp.serverTime;
      currentSince = resp.serverTime;
      
      totalPushed += cSets.length + cCards.length + cQuiz.length + cReviews.length + cActivity.length + cChains.length + cChainSteps.length;
      totalPulled += resp.sets.length + resp.cards.length + resp.quiz.length + resp.reviews.length + resp.chains.length + resp.chainSteps.length;
    }

    await writeAll(local);
    await setLastSync(finalServerTime);

    return {
      pushed: totalPushed,
      pulled: totalPulled,
      serverTime: finalServerTime,
    };
  } finally {
    syncing = false;
  }
}
