// Sync orchestrator: push local changes, pull server changes, both
// last-write-wins. No-ops when signed out or offline — local data is the
// source of truth and never blocked on the network.

import { readRaw, saveRaw, uid, getLastSync, setLastSync, KEYS } from "../storage/store.js";
import { getAuth, setAuth, authedFetch } from "./auth.js";
import { SYNC_LIMITS, toServer, applyServer } from "../../shared/sync-map.js";

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
  for (let i = 0; i < (arr || []).length; i += size) res.push(arr.slice(i, i + size));
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
    
    // Split the push to what the server will accept. Each array has its own
    // cap, so one size for all of them would send 60 sets against a limit of
    // 50 and fail the whole batch — forever, for anyone with a big library.
    const chunked = {
      sets: chunk(payload.sets, SYNC_LIMITS.sets),
      cards: chunk(payload.cards, SYNC_LIMITS.cards),
      quiz: chunk(payload.quiz, SYNC_LIMITS.quiz),
      reviews: chunk(payload.reviews, SYNC_LIMITS.reviews),
      activity: chunk(payload.activity, SYNC_LIMITS.activity),
      chains: chunk(payload.chains, SYNC_LIMITS.chains),
      chainSteps: chunk(payload.chainSteps, SYNC_LIMITS.chainSteps),
    };
    const maxChunks = Math.max(1, ...Object.values(chunked).map((c) => c.length));
    
    let totalPushed = 0;
    let totalPulled = 0;
    let currentSince = lastSync || undefined;
    let finalServerTime = null;

    for (let i = 0; i < maxChunks; i++) {
      const cSets = chunked.sets[i] || [];
      const cCards = chunked.cards[i] || [];
      const cQuiz = chunked.quiz[i] || [];
      const cReviews = chunked.reviews[i] || [];
      const cActivity = chunked.activity[i] || [];
      const cChains = chunked.chains[i] || [];
      const cChainSteps = chunked.chainSteps[i] || [];
      
      const res = await authedFetch("/v1/sync", {
        method: "POST",
        body: JSON.stringify({ since: currentSince, sets: cSets, cards: cCards, quiz: cQuiz, reviews: cReviews, activity: cActivity, chains: cChains, chainSteps: cChainSteps }),
      });
      if (!res.ok) throw new Error(`sync failed (${res.status})`);
      const resp = await res.json();

      local = applyServer(resp, local, uid);
      finalServerTime = resp.serverTime;
      currentSince = resp.serverTime;
      
      totalPushed += cSets.length + cCards.length + cQuiz.length + cReviews.length + cActivity.length + cChains.length + cChainSteps.length;
      // An older server answers without the chain arrays; don't throw on it.
      totalPulled += (resp.sets?.length || 0) + (resp.cards?.length || 0) + (resp.quiz?.length || 0) +
        (resp.reviews?.length || 0) + (resp.chains?.length || 0) + (resp.chainSteps?.length || 0);
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
