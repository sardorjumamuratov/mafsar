import * as assert from "node:assert";

// Mock chrome environment
global.chrome = {
  runtime: {
    lastError: null,
    sendMessage: (msg, cb) => {
      if (msg.type === "BILLING_CHECKOUT") {
        cb({ url: "https://mock-checkout" });
      } else if (msg.type === "BILLING_PORTAL") {
        cb({ url: "https://mock-portal" });
      }
    }
  },
  storage: {
    local: {
      get: (key, cb) => cb({ auth: { accessToken: "token" } }),
      set: (obj, cb) => { if (cb) cb(); },
      remove: (key, cb) => { if (cb) cb(); }
    }
  }
};
global.API_BASE = "https://mafsar-production.up.railway.app";

let fetchResponses = [];
global.fetch = async (url, opts) => {
  if (url.includes("/v1/me")) {
    const r = fetchResponses.shift();
    if (r instanceof Error) throw r;
    return r;
  }
  return { ok: true, json: async () => ({}) };
};

// pollBilling waits 1.5s between polls; collapse that to nothing so the suite is
// fast enough to run in CI. It reads the global at call time, so overriding it
// here (before any poll runs) is enough. Order of fetchResponses is preserved
// because each iteration still awaits fetch (a microtask).
global.setTimeout = (cb) => { cb(); return 0; };

import { pollBilling } from "../src/sync/auth.js";

async function testPollResolves() {
  fetchResponses = [
    new Error("transient network failure"),
    { ok: true, json: async () => ({ usage: { plan: "free" } }) },
    { ok: true, json: async () => ({ usage: { plan: "pro" } }) } // plan is pro
  ];
  
  const res = await pollBilling({ fromPlan: "free" });
  assert.equal(res, true);
  console.log("resolves passed");
}

async function testPollCancel() {
  const ac = new AbortController();
  fetchResponses = [
    { ok: true, json: async () => {
      ac.abort();
      return { usage: { plan: "free" } };
    }}
  ];
  try {
    await pollBilling({ cancelSignal: ac.signal });
    assert.fail("should throw");
  } catch (e) {
    assert.equal(e.message, "cancelled");
  }
  console.log("cancel passed");
}

async function testPollTimeout() {
  fetchResponses = [];
  // Stub setTimeout so the timeout test runs fast
  const oldSetTimeout = global.setTimeout;
  global.setTimeout = (cb) => cb();
  
  // Return free plan repeatedly
  global.fetch = async (url) => {
    return { ok: true, json: async () => ({ usage: { plan: "free" } }) };
  };

  try {
    await pollBilling();
    assert.fail("should throw");
  } catch (e) {
    assert.equal(e.message, "Checkout timed out");
  }
  
  global.setTimeout = oldSetTimeout;
  console.log("timeout passed");
}

(async () => {
  await testPollResolves();
  await testPollCancel();
  await testPollTimeout();
  console.log("All tests passed");
})();
