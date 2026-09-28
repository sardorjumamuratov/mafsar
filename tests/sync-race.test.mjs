// A sync reads the library, waits on the network, then writes it back. Anything
// another context saves during that wait — the service worker filing a captured
// answer, most often — must survive the write-back, and must reach the server on
// the next sync. Both used to fail: "Capture last answer" said it saved, and the
// set was gone a moment later.
// Run: node tests/sync-race.test.mjs
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const REPO = path.join(import.meta.dirname, "..");

let store = {};
const listeners = [];
const clone = (v) => JSON.parse(JSON.stringify(v));
const keyList = (k) => (Array.isArray(k) ? k : k == null ? Object.keys(store) : typeof k === "object" ? Object.keys(k) : [k]);
global.chrome = {
  runtime: { getManifest: () => ({ version: "0.4.0" }) },
  storage: {
    onChanged: { addListener: (fn) => listeners.push(fn) },
    local: {
      get: (keys, cb) => {
        const r = {};
        for (const k of keyList(keys)) if (store[k] !== undefined) r[k] = clone(store[k]);
        setTimeout(() => cb(r), 0);
      },
      set: (obj, cb) => {
        const ch = {};
        for (const [k, v] of Object.entries(obj)) { ch[k] = { newValue: v }; store[k] = clone(v); }
        setTimeout(() => { cb?.(); listeners.forEach((f) => f(ch, "local")); }, 0);
      },
      remove: (keys, cb) => { for (const k of keyList(keys)) delete store[k]; setTimeout(() => cb?.(), 0); },
      getBytesInUse: (_k, cb) => cb(0),
    },
  },
};

// The worker is a separate context with its own copy of store.js.
const worker = await import(pathToFileURL(path.join(REPO, "src/storage/store.js")).href + "?ctx=worker");
const { syncNow } = await import(pathToFileURL(path.join(REPO, "src/sync/sync.js")).href);

let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const EMPTY = { sets: [], cards: [], quiz: [], reviews: [], activity: [], chains: [], chainSteps: [] };

function seed() {
  store = {
    auth: { accessToken: "t", user: { id: "u1" } },
    activeAccountId: "u1",
    u1_sessions: [{ id: "s-old", source: "chatgpt", title: "Existing set", capturedAt: 1 }],
    u1_studySets: [{ sessionId: "s-old", title: "Existing set", updatedAt: "2026-09-01T00:00:00.000Z", createdAt: 1, flashcards: [], quiz: [] }],
    u1_activity: {},
    u1_reviewLog: [],
  };
}

/** A server that waits until released, then answers with `resp`. */
function slowServer(resp, sent) {
  let release;
  const gate = new Promise((r) => (release = r));
  global.fetch = async (_url, opts) => {
    sent?.push(JSON.parse(opts.body));
    await gate;
    return { ok: true, status: 200, json: async () => resp() };
  };
  return () => release();
}

async function captureFromWorker(title) {
  const s = await worker.addSession({ source: "chatgpt", title, capturedAt: Date.now(), messages: [] });
  await worker.saveStudySet({ sessionId: s.id, title, flashcards: [{ id: `c-${title}`, front: "q", back: "a" }], quiz: [] });
  return s;
}

const tick = (ms = 25) => new Promise((r) => setTimeout(r, ms));

console.log("a capture saved while a sync is in flight");

await test("survives the sync's write-back", async () => {
  seed();
  const release = slowServer(() => ({ ...EMPTY, serverTime: new Date().toISOString() }));
  const syncing = syncNow();
  await tick(); // the sync has read the library and is waiting on the server
  await captureFromWorker("Captured answer");
  release();
  await syncing;
  assert.deepEqual(store.u1_sessions.map((s) => s.title).sort(), ["Captured answer", "Existing set"]);
  assert.ok(store.u1_studySets.some((s) => s.title === "Captured answer"), "the set must survive, not just the session");
});

await test("reaches the server on the next sync, even if the server clock is ahead", async () => {
  seed();
  // The server answers with a time just after the capture — ordinary latency,
  // or a server clock slightly ahead of this one.
  const release = slowServer(() => ({ ...EMPTY, serverTime: new Date(Date.now() + 5000).toISOString() }));
  const syncing = syncNow();
  await tick();
  const captured = await captureFromWorker("Captured answer");
  release();
  await syncing;

  const sent = [];
  const release2 = slowServer(() => ({ ...EMPTY, serverTime: new Date(Date.now() + 6000).toISOString() }), sent);
  const next = syncNow();
  release2();
  await next;
  const pushedSets = sent.flatMap((b) => b.sets || []).map((s) => s.id);
  assert.ok(pushedSets.includes(captured.id), "a row written during the last sync was never pushed: it would stay on this device forever");
});

await test("rows the server sent back still land", async () => {
  seed();
  const fromServer = {
    ...EMPTY,
    serverTime: new Date().toISOString(),
    sets: [{ id: "s-remote", title: "From another device", mode: "general", createdAt: "2026-09-02T00:00:00.000Z", updatedAt: "2026-09-02T00:00:00.000Z", deleted: false }],
  };
  const release = slowServer(() => fromServer);
  const syncing = syncNow();
  await tick();
  await captureFromWorker("Captured answer");
  release();
  await syncing;
  const titles = store.u1_sessions.map((s) => s.title).sort();
  assert.deepEqual(titles, ["Captured answer", "Existing set", "From another device"]);
});

await test("a sync with nothing happening in parallel behaves as before", async () => {
  seed();
  const release = slowServer(() => ({ ...EMPTY, serverTime: new Date().toISOString() }));
  const syncing = syncNow();
  release();
  const res = await syncing;
  assert.equal(res.pushed, 1, "the one existing set is pushed");
  assert.deepEqual(store.u1_sessions.map((s) => s.title), ["Existing set"]);
});

console.log(`\n${passed} passed`);
