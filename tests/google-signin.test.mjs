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
global.fetch = async (url, opts) => {
  if (url.includes("/start")) {
    return {
      status: 200,
      ok: true,
      json: async () => ({ authUrl: "https://auth", pollToken: "test" })
    };
  }
  if (url.includes("/poll")) {
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

(async () => {
  await testPollReady();
  await testPollExpired();
  await testPollCancel();
  console.log("All tests passed");
})();
