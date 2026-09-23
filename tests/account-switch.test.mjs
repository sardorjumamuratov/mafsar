// Signing in as a different account on a device that already holds sets.
// Run: node tests/account-switch.test.mjs
import assert from "node:assert/strict";

// chrome.storage.local is callback-style; keep the shape faithful or the auth
// helpers never resolve (see the note in tests/google-signin.test.mjs).
let store = {};
const keyList = (keys) => (Array.isArray(keys) ? keys : [keys]);
global.chrome = {
  runtime: { getManifest: () => ({ version: "0.4.0" }) },
  storage: {
    local: {
      get: (keys, cb) => cb(Object.fromEntries(keyList(keys).map((k) => [k, store[k]]))),
      set: (obj, cb) => { Object.assign(store, obj); cb?.(); },
      remove: (keys, cb) => { for (const k of keyList(keys)) delete store[k]; cb?.(); },
    },
  },
};

const { accountSwitchPending, authedFetch, getLastUserId, noteSignedInUser, rememberAccount, TIMEOUT_MESSAGE } =
  await import("../src/sync/auth.js");
const { syncNow } = await import("../src/sync/sync.js");

let passed = 0;
async function test(name, fn) {
  store = {};
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const signedInAs = (id) => { store.auth = { accessToken: "tok", refreshToken: "r", user: { id, email: id + "@example.com" } }; };

console.log("whose device is this");

await test("the first sign-in ever claims the device, with nothing to ask about", async () => {
  assert.equal(await noteSignedInUser("user-a"), "first");
  assert.equal(await getLastUserId(), "user-a");
  assert.equal(await accountSwitchPending(), false);
});

await test("signing back in to the same account is not a switch", async () => {
  await noteSignedInUser("user-a");
  assert.equal(await noteSignedInUser("user-a"), "same");
  assert.equal(await accountSwitchPending(), false);
});

await test("a different account is a switch, and nothing is decided for the learner", async () => {
  await noteSignedInUser("user-a");
  assert.equal(await noteSignedInUser("user-b"), "switched");
  assert.equal(await accountSwitchPending(), true);
  // The device still belongs to A until the learner answers: no silent handover.
  assert.equal(await getLastUserId(), "user-a");
});

await test("answering the question hands the device over and unblocks sync", async () => {
  await noteSignedInUser("user-a");
  await noteSignedInUser("user-b");
  await rememberAccount("user-b");
  assert.equal(await getLastUserId(), "user-b");
  assert.equal(await accountSwitchPending(), false);
});

console.log("sync while a switch is unanswered");

await test("account A's sets are never pushed as account B", async () => {
  signedInAs("user-b");
  store.studySets = [{ sessionId: "s1", title: "A's set", updatedAt: "2026-01-01T00:00:00.000Z", flashcards: [] }];
  await noteSignedInUser("user-a");
  await noteSignedInUser("user-b");
  let called = false;
  global.fetch = async () => { called = true; return { ok: true, status: 200, json: async () => ({}) }; };
  assert.deepEqual(await syncNow(), { skipped: "account-switch" });
  assert.equal(called, false, "a blocked sync must not reach the network at all");
});

await test("once answered, sync runs again", async () => {
  signedInAs("user-b");
  await noteSignedInUser("user-a");
  await noteSignedInUser("user-b");
  await rememberAccount("user-b");
  let called = false;
  global.fetch = async () => {
    called = true;
    return { ok: true, status: 200, json: async () => ({ serverTime: "2026-09-23T09:00:00.000Z", sets: [], cards: [], quiz: [], reviews: [], chains: [], chainSteps: [], activity: [] }) };
  };
  const res = await syncNow();
  assert.equal(called, true);
  assert.equal(res.skipped, undefined);
});

console.log("a stalled request is an error, not a hang");

await test("every signed-in request carries an abort signal", async () => {
  signedInAs("user-a");
  let seen = null;
  global.fetch = async (_url, opts) => { seen = opts.signal; return { ok: true, status: 200 }; };
  await authedFetch("/v1/me");
  assert.ok(seen instanceof AbortSignal, "without a signal there is nothing to time out");
  assert.equal(seen.aborted, false);
});

await test("a timed-out request says so in words the learner can act on", async () => {
  signedInAs("user-a");
  global.fetch = async () => { throw Object.assign(new Error("aborted"), { name: "TimeoutError" }); };
  await assert.rejects(() => authedFetch("/v1/me"), (e) => e.message === TIMEOUT_MESSAGE);
});

console.log(`\n${passed} passed`);
