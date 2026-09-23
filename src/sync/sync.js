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
    const res = await authedFetch("/v1/sync", {
      method: "POST",
      body: JSON.stringify({ since: lastSync || undefined, ...payload }),
    });
    if (!res.ok) throw new Error(`sync failed (${res.status})`);
    const resp = await res.json();

    const merged = applyServer(resp, local, uid);
    await writeAll(merged);
    await setLastSync(resp.serverTime);

    return {
      pushed: payload.sets.length + payload.cards.length + payload.quiz.length + payload.reviews.length,
      pulled: resp.sets.length + resp.cards.length + resp.quiz.length + resp.reviews.length,
      serverTime: resp.serverTime,
    };
  } finally {
    syncing = false;
  }
}
