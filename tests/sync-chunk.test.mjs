// A big library still syncs: the push is split to what /v1/sync accepts, and
// every row goes exactly once. Run: node tests/sync-chunk.test.mjs
import assert from "node:assert/strict";

let store = {};
const keyList = (keys) => (Array.isArray(keys) ? keys : keys ? [keys] : Object.keys(store));
global.chrome = {
  runtime: { getManifest: () => ({ version: "0.4.0" }) },
  storage: {
    local: {
      get: (keys, cb) => {
        if (keys === null) return cb(store);
        const res = {};
        for (const k of keyList(keys)) if (store[k] !== undefined) res[k] = store[k];
        cb(res);
      },
      set: (obj, cb) => { Object.assign(store, obj); cb?.(); },
      remove: (keys, cb) => { for (const k of keyList(keys)) delete store[k]; cb?.(); },
      getBytesInUse: (_keys, cb) => cb(0),
    },
    onChanged: { addListener: () => {} },
  },
};

const { SYNC_LIMITS } = await import("../shared/sync-map.js");
const { syncNow } = await import("../src/sync/sync.js");

let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

/** A library of `n` sets, one card each, plus `reviews` review rows. */
function seedLibrary(n, reviews) {
  const stamp = "2026-09-24T09:00:00.000Z";
  store = {
    auth: { accessToken: "tok", user: { id: "u1" } },
    activeAccountId: "u1",
    u1_sessions: Array.from({ length: n }, (_, i) => ({ id: `s${i}`, source: "chatgpt", title: `Set ${i}`, capturedAt: 1 })),
    u1_studySets: Array.from({ length: n }, (_, i) => ({
      sessionId: `s${i}`, title: `Set ${i}`, updatedAt: stamp, createdAt: 1,
      flashcards: [{ id: `c${i}`, front: "f", back: "b", updatedAt: stamp }],
      quiz: [],
    })),
    u1_activity: {},
    u1_reviewLog: Array.from({ length: reviews }, (_, i) => ({
      id: `r${i}`, cardId: "c0", grade: 3, reviewedAt: stamp,
    })),
  };
}

const requests = [];
function mockServer() {
  global.fetch = async (_url, opts) => {
    const body = JSON.parse(opts.body);
    requests.push(body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        serverTime: "2026-09-24T09:00:01.000Z",
        sets: [], cards: [], quiz: [], reviews: [], activity: [], chains: [], chainSteps: [],
      }),
    };
  };
}

console.log("pushing a big library");

await test("no request exceeds a cap the server enforces", async () => {
  requests.length = 0;
  seedLibrary(120, 1200);
  mockServer();
  await syncNow();
  assert.ok(requests.length > 1, "120 sets against a cap of 50 has to be more than one request");
  for (const body of requests) {
    for (const [name, limit] of Object.entries(SYNC_LIMITS)) {
      assert.ok((body[name]?.length || 0) <= limit, `${name}: ${body[name]?.length} rows exceeds the cap of ${limit}`);
    }
  }
});

await test("every row is pushed exactly once", async () => {
  requests.length = 0;
  seedLibrary(120, 1200);
  mockServer();
  const res = await syncNow();
  const seen = (key) => requests.flatMap((b) => (b[key] || []).map((r) => r.id));
  const setIds = seen("sets");
  const cardIds = seen("cards");
  const reviewIds = seen("reviews");
  assert.equal(setIds.length, 120);
  assert.equal(new Set(setIds).size, 120, "a set was sent twice or not at all");
  assert.equal(cardIds.length, 120);
  assert.equal(new Set(cardIds).size, 120);
  assert.equal(reviewIds.length, 1200);
  assert.equal(new Set(reviewIds).size, 1200);
  assert.equal(res.pushed, 120 + 120 + 1200);
});

await test("a small library still goes in one request", async () => {
  requests.length = 0;
  seedLibrary(3, 5);
  mockServer();
  await syncNow();
  assert.equal(requests.length, 1);
});

await test("a failed chunk leaves the cursor alone, so nothing is silently skipped", async () => {
  requests.length = 0;
  seedLibrary(120, 0);
  let n = 0;
  global.fetch = async (_url, opts) => {
    requests.push(JSON.parse(opts.body));
    if (++n === 2) return { ok: false, status: 500, json: async () => ({}) };
    return {
      ok: true, status: 200,
      json: async () => ({ serverTime: "2026-09-24T09:00:01.000Z", sets: [], cards: [], quiz: [], reviews: [], activity: [], chains: [], chainSteps: [] }),
    };
  };
  await assert.rejects(() => syncNow(), /sync failed \(500\)/);
  assert.equal(store.u1_lastSync, undefined, "the cursor must not move when a chunk failed");
});

console.log(`\n${passed} passed`);
