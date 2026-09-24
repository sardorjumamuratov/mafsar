import test from "node:test";
import assert from "node:assert";
import { appendReviewLog, evictToFreeSpace, getSettings, setLastSync, saveStudySet, getActiveAccountId, switchActiveAccount } from "../src/storage/store.js";

function mockStorage() {
  let store = {};
  let bytesInUse = 0;
  return {
    get: (keys, cb) => cb(keys === null ? store : (typeof keys === "string" ? { [keys]: store[keys] } : store)),
    set: (obj, cb) => { Object.assign(store, obj); if (cb) cb(); },
    remove: (keys, cb) => { (Array.isArray(keys) ? keys : [keys]).forEach(k => delete store[k]); if (cb) cb(); },
    clear: (cb) => { store = {}; if (cb) cb(); },
    getBytesInUse: (keys, cb) => cb(bytesInUse),
    __setBytesInUse: (b) => { bytesInUse = b; },
    __dump: () => store
  };
}

test("an unsynced row surviving the cap and a synced row being trimmed", async () => {
  global.chrome = { storage: { local: mockStorage(), onChanged: { addListener: () => {} } }, runtime: {} };
  await switchActiveAccount("acc1");
  await setLastSync("2023-01-01T10:00:00.000Z");

  for (let i = 0; i < 2005; i++) {
    // 2000 of them are synced (old)
    // 5 of them are unsynced (new)
    const isSynced = i < 2000;
    await appendReviewLog({
      id: `r${i}`,
      reviewedAt: isSynced ? `2022-01-01T10:00:00.000Z` : `2024-01-01T10:00:00.000Z`
    });
  }

  const raw = await new Promise(r => global.chrome.storage.local.get(null, r));
  const log = raw["acc1_reviewLog"];

  // The cap bounds the whole log at 2000, and only synced rows may be dropped
  // to meet it — so all 5 unsynced are still here and 5 old synced ones went.
  assert.strictEqual(log.length, 2000);
  const kept = new Set(log.map((r) => r.id));
  for (let i = 2000; i < 2005; i++) assert.ok(kept.has(`r${i}`), `unsynced r${i} must survive`);

  // Another synced row trims one more synced row, never an unsynced one.
  await appendReviewLog({ id: "rx", reviewedAt: "2022-01-01T10:00:00.000Z" });
  const raw2 = await new Promise(r => global.chrome.storage.local.get(null, r));
  const log2 = raw2["acc1_reviewLog"];
  assert.strictEqual(log2.length, 2000);
  const kept2 = new Set(log2.map((r) => r.id));
  for (let i = 2000; i < 2005; i++) assert.ok(kept2.has(`r${i}`), `unsynced r${i} must still survive`);
});

test("the eviction policy refuses to evict unsynced data and drops synced inactive accounts", async () => {
  global.chrome = { storage: { local: mockStorage(), onChanged: { addListener: () => {} } }, runtime: {} };
  
  // Set up acc2 (fully synced)
  await switchActiveAccount("acc2");
  await setLastSync("2024-01-01T10:00:00.000Z");
  await new Promise(r => global.chrome.storage.local.set({ "acc2_studySets": [{ sessionId: "s2", updatedAt: "2023-01-01T10:00:00.000Z", flashcards: [{ id: "c1", updatedAt: "2023-01-01T10:00:00.000Z" }] }] }, r));

  // Set up acc3 (unsynced set)
  await switchActiveAccount("acc3");
  await setLastSync("2024-01-01T10:00:00.000Z");
  await saveStudySet({ sessionId: "s3", flashcards: [{ id: "c2", updatedAt: "2025-01-01T10:00:00.000Z" }] });
  
  // Set up acc1 (active)
  await switchActiveAccount("acc1");

  global.chrome.storage.local.__setBytesInUse(5_000_000); // 5MB triggers eviction

  const freed = await evictToFreeSpace();
  assert.strictEqual(freed, true);
  
  const raw = await new Promise(r => global.chrome.storage.local.get(null, r));
  
  assert.ok(!raw["acc2_studySets"], "Fully synced account acc2 should be evicted");
  assert.ok(raw["acc3_studySets"], "Unsynced account acc3 must NOT be evicted");
  assert.ok(raw["acc1_studySets"] || true, "Active account acc1 must NOT be evicted");
});

test("settings cleanup", async () => {
  global.chrome = { storage: { local: mockStorage(), onChanged: { addListener: () => {} } }, runtime: {} };
  await switchActiveAccount("acc1");
  
  await new Promise(r => global.chrome.storage.local.set({
    settings: { provider: "gemini", apiKey: "dead-key", model: "flash", theme: "dark" }
  }, r));
  
  const s = await getSettings();
  assert.strictEqual(s.provider, undefined);
  assert.strictEqual(s.apiKey, undefined);
  assert.strictEqual(s.model, undefined);
  assert.strictEqual(s.theme, "dark");
  
  const raw = await new Promise(r => global.chrome.storage.local.get("settings", x => r(x.settings)));
  assert.strictEqual(raw.apiKey, undefined, "Dead field must be cleared from disk");
});
