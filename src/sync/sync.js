// Sync orchestrator: push local changes, pull server changes, both
// last-write-wins. No-ops when signed out or offline — local data is the
// source of truth and never blocked on the network.

import { readRaw, uid } from "../storage/store.js";
import { getAuth, setAuth, authedFetch } from "./auth.js";
import { toServer, applyServer } from "./map.js";

const KEYS = ["sessions", "studySets", "activity", "reviewLog"];
let syncing = false;

function writeAll(state) {
  return new Promise((resolve) => {
    chrome.storage.local.set(
      {
        sessions: state.sessions,
        studySets: state.studySets,
        activity: state.activity,
        reviewLog: state.reviewLog,
      },
      () => resolve()
    );
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

  syncing = true;
  try {
    const raw = await readRaw(KEYS);
    const local = {
      sessions: raw.sessions || [],
      studySets: raw.studySets || [],
      activity: raw.activity || {},
      reviewLog: raw.reviewLog || [],
    };
    const payload = toServer(local, auth.lastSync);
    const res = await authedFetch("/v1/sync", {
      method: "POST",
      body: JSON.stringify({ since: auth.lastSync || undefined, ...payload }),
    });
    if (!res.ok) throw new Error(`sync failed (${res.status})`);
    const resp = await res.json();

    const merged = applyServer(resp, local, uid);
    await writeAll(merged);
    await setAuth({ lastSync: resp.serverTime });

    return {
      pushed: payload.sets.length + payload.cards.length + payload.quiz.length + payload.reviews.length,
      pulled: resp.sets.length + resp.cards.length + resp.quiz.length + resp.reviews.length,
      serverTime: resp.serverTime,
    };
  } finally {
    syncing = false;
  }
}
