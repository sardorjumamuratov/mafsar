import * as assert from "node:assert";

// Basic harness for testing the poll loop behavior
let currentTab = null;
global.chrome = {
  tabs: {
    create: ({ url }, cb) => {
      currentTab = { id: 123, url };
      if (cb) cb(currentTab);
    },
    remove: (id) => {
      if (currentTab?.id === id) currentTab = null;
      return Promise.resolve();
    }
  }
};

let fetchResponses = [];
let pollCalls = [];
global.fetch = async (url, opts) => {
  if (url.includes("/start")) {
    return {
      status: 200,
      ok: true,
      json: async () => ({ authUrl: "https://auth", pollId: "row-1", pollToken: "test" })
    };
  }
  if (url.includes("/poll")) {
    pollCalls.push({ at: Date.now(), body: JSON.parse(opts.body) });
    const r = fetchResponses.shift();
    if (r instanceof Error) throw r;
    return r;
  }
};

// chrome.storage.local is callback-style, not Promise-returning — setAuth()/getAuth()
// in src/sync/auth.js call get(key, cb) and set(obj, cb) and wait on the callback.
// A mock that ignores the callback leaves setAuth() pending forever (and, with no
// timers left to keep the event loop alive, the process exits "successfully" without
// ever reaching an assertion) — this bit us once already, keep the shape faithful.
let storageData = {};
global.chrome.storage = {
  local: {
    get: (key, cb) => cb({ [key]: storageData[key] }),
    set: (obj, cb) => { Object.assign(storageData, obj); if (cb) cb(); },
  },
};
global.API_BASE = "https://mafsar-production.up.railway.app";

import { googleSignIn } from "../src/sync/auth.js";

async function testPollReady() {
  fetchResponses = [
    { ok: true, json: async () => ({ status: "pending" }) },
    new Error("transient network"),
    { ok: true, json: async () => ({ status: "ready", accessToken: "a", refreshToken: "r", user: { email: "u" } }) }
  ];
  let tabUrl = null;
  const user = await googleSignIn({
    onTab: (url) => { tabUrl = url; }
  });
  assert.equal(tabUrl, "https://auth");
  assert.equal(user.email, "u");
  console.log("ready poll passed");
}

async function testPollExpired() {
  fetchResponses = [
    { status: 410, json: async () => ({ status: "expired" }) }
  ];
  try {
    await googleSignIn({ onTab: () => {} });
    assert.fail("should throw");
  } catch (e) {
    assert.equal(e.message, "Sign-in expired");
  }
  console.log("expired poll passed");
}

async function testPollCancel() {
  const ac = new AbortController();
  fetchResponses = [
    { ok: true, json: async () => {
      ac.abort();
      return { status: "pending" };
    }}
  ];
  try {
    await googleSignIn({ onTab: () => {}, cancelSignal: ac.signal });
    assert.fail("should throw");
  } catch (e) {
    assert.equal(e.message, "cancelled");
  }
  console.log("cancel passed");
}

// 400 polls at a fixed 1.5s burned most of the per-IP hourly budget in one
// attempt, so a second attempt failed on the rate limit rather than on anything
// the learner did.
async function testPollBackoff() {
  pollCalls = [];
  fetchResponses = [
    { ok: true, json: async () => ({ status: "pending" }) },
    { ok: true, json: async () => ({ status: "pending" }) },
    { ok: true, json: async () => ({ status: "ready", accessToken: "a", refreshToken: "r", user: { email: "u" } }) },
  ];
  await googleSignIn({ onTab: () => {} });
  assert.equal(pollCalls.length, 3);
  assert.equal(pollCalls[0].body.pollId, "row-1", "the server must be able to look the row up by id");
  const first = pollCalls[1].at - pollCalls[0].at;
  const second = pollCalls[2].at - pollCalls[1].at;
  assert.ok(second > first + 100, `polling must slow down, got ${first}ms then ${second}ms`);
  console.log("backoff passed");
}

(async () => {
  await testPollBackoff();
  await testPollReady();
  await testPollExpired();
  await testPollCancel();
  console.log("All tests passed");
})();
