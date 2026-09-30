import test from "node:test";
import assert from "node:assert";

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
    }
  }
};
global.window = { dispatchEvent: () => {} };

const { rateSet, clearRating, getRating, loadRatingsStore, flushPendingRatings, formatCount } = await import("../src/storage/ratings.js");
const { wipeAllRaw } = await import("../src/storage/store.js");

test("ratings store: optimistic update, flush, and format", async (t) => {
  for (const k of Object.keys(store)) delete store[k]; store["auth"] = { "accessToken": "token" };
  await loadRatingsStore();
  
  let fetchCalls = [];
  global.fetch = async (url, opts) => {
    const body = opts.body ? JSON.parse(opts.body) : null;
    fetchCalls.push({ url, body, method: opts.method });
    
    if (url.includes("fail")) return { ok: false, status: 500, json: async () => ({ error: "fail" }) };
    if (url.includes("offline")) throw new Error("Offline");
    
    if (opts.method === "PUT") {
      return { ok: true, status: 200, json: async () => ({ yourStars: body.stars, avg: 4.5, count: 10 }) };
    } else if (opts.method === "DELETE") {
      return { ok: true, status: 200, json: async () => ({ yourStars: null, avg: 4.0, count: 9 }) };
    }
    
    return { ok: true, status: 200, json: async () => ({}) };
  };

  // rate success
  await rateSet("root1", "client1", 5);
  assert.strictEqual(fetchCalls.length, 1);
  assert.strictEqual(fetchCalls[0].method, "PUT");
  assert.strictEqual(fetchCalls[0].body.stars, 5);
  let r = getRating("root1");
  assert.strictEqual(r.yourStars, 5);
  assert.strictEqual(r.ratingAvg, 4.5);
  assert.strictEqual(r.ratingCount, 10);

  // rate fail (rollback)
  fetchCalls = [];
  try { await rateSet("root1", "fail", 2); } catch (e) {}
  r = getRating("root1");
  assert.strictEqual(r.yourStars, 5); // rolled back to 5
  assert.strictEqual(fetchCalls.length, 1);

  // rate offline (pending)
  fetchCalls = [];
  await rateSet("root2", "offline", 4);
  r = getRating("root2");
  assert.strictEqual(r.yourStars, 4); // optimistic
  assert.strictEqual(r.ratingAvg, null); // untouched
  assert.strictEqual(fetchCalls.length, 1);

  // delete offline
  fetchCalls = [];
  await clearRating("root1", "offline");
  r = getRating("root1");
  assert.strictEqual(r.yourStars, null); // optimistic

  // flush
  fetchCalls = [];
  global.fetch = async (url, opts) => {
    fetchCalls.push({ url, method: opts.method });
    if (opts.method === "PUT") {
      return { ok: true, status: 200, json: async () => ({ yourStars: 4, avg: 3.0, count: 5 }) };
    } else if (opts.method === "DELETE") {
      return { ok: true, status: 200, json: async () => ({ yourStars: null, avg: 2.0, count: 4 }) };
    }
  };
  
  await flushPendingRatings();
  assert.strictEqual(fetchCalls.length, 2);
  
  r = getRating("root2");
  assert.strictEqual(r.yourStars, 4);
  assert.strictEqual(r.ratingAvg, 3.0);
  
  r = getRating("root1");
  assert.strictEqual(r.yourStars, null);
  assert.strictEqual(r.ratingAvg, 2.0);

  // formatCount
  assert.strictEqual(formatCount(999), "999");
  assert.strictEqual(formatCount(1000), "1k");
  assert.strictEqual(formatCount(1200), "1.2k");
  assert.strictEqual(formatCount(1000000), "1M");
  assert.strictEqual(formatCount(2500000), "2.5M");
});
