// Two accounts on one device. Run: node tests/per-account.test.mjs
import assert from "node:assert/strict";

let store = {};
const listeners = [];
const keyList = (keys) => (Array.isArray(keys) ? keys : (keys ? [keys] : Object.keys(store)));
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
      clear: (cb) => { store = {}; cb?.(); }
    },
    onChanged: { addListener: (fn) => listeners.push(fn) },
  },
};
/** Fire a storage change the way chrome does, for the cross-context cases. */
const changed = (changes) => listeners.forEach((fn) => fn(changes, "local"));

const { getActiveAccountId, switchActiveAccount, exportAll, deleteActiveAccountData, saveStudySet, getStudySets, getLastSync, setLastSync } =
  await import("../src/storage/store.js");
const { setAuth, logout } = await import("../src/sync/auth.js");

let passed = 0;
async function test(name, fn) {
  store = {};
  await switchActiveAccount(null); // clear cache
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("Per-account data");

await test("one-time migration of existing device", async () => {
  store.sessions = [{ id: "s1" }];
  store.studySets = [{ id: "set1" }];
  store.auth = { user: { id: "user-a" } };
  
  const id = await getActiveAccountId();
  assert.equal(id, "user-a");
  assert.ok(store["user-a_sessions"], "migrated sessions");
  assert.ok(store["user-a_studySets"], "migrated studySets");
  assert.equal(store.sessions, undefined, "old keys removed");
});

await test("A's rows are invisible as B", async () => {
  await setAuth({ user: { id: "user-a" } });
  await saveStudySet({ id: "set-a", sessionId: "s-a", flashcards: [] });
  let sets = await getStudySets();
  assert.equal(sets.length, 1);
  assert.equal(sets[0].id, "set-a");
  
  await setAuth({ user: { id: "user-b" } });
  sets = await getStudySets();
  assert.equal(sets.length, 0, "B cannot see A's sets");
});

await test("same-account round trip", async () => {
  await setAuth({ user: { id: "user-a" } });
  await saveStudySet({ id: "set-a", sessionId: "s-a", flashcards: [] });
  await logout();
  
  // As local/logged out (but still A since activeAccountId persists)
  let sets = await getStudySets();
  assert.equal(sets.length, 1);
  
  // Login as A again
  await setAuth({ user: { id: "user-a" } });
  sets = await getStudySets();
  assert.equal(sets.length, 1);
});

await test("lastSync survives sign-out", async () => {
  await setAuth({ user: { id: "user-a" } });
  await setLastSync("2026-01-01T00:00:00Z");
  assert.equal(await getLastSync(), "2026-01-01T00:00:00Z");
  await logout();
  assert.equal(await getLastSync(), "2026-01-01T00:00:00Z", "survives logout");
});

await test("backup without tokens", async () => {
  await setAuth({ user: { id: "user-a", accessToken: "secret" } });
  await saveStudySet({ id: "set-a", sessionId: "s-a", flashcards: [] });
  
  const backup = await exportAll();
  assert.equal(backup.auth, undefined, "no tokens");
  assert.ok(backup.studySets, "has study sets");
  assert.equal(backup.studySets[0].id, "set-a");
});

await test("delete-account", async () => {
  await setAuth({ user: { id: "user-a" } });
  await saveStudySet({ id: "set-a", sessionId: "s-a", flashcards: [] });
  
  await setAuth({ user: { id: "user-b" } });
  await saveStudySet({ id: "set-b", sessionId: "s-b", flashcards: [] });
  
  await deleteActiveAccountData();
  
  let setsB = await getStudySets();
  assert.equal(setsB.length, 0);
  
  await setAuth({ user: { id: "user-a" } });
  let setsA = await getStudySets();
  assert.equal(setsA.length, 1, "A's data is untouched");
});

await test("a device migrated while signed out is adopted by the first account in", async () => {
  // The panel gates on an account, but the worker can capture without one, and
  // an upgrade can land while signed out. That data must not be stranded.
  await saveStudySet({ id: "orphan", sessionId: "s-o", flashcards: [] });
  assert.equal(await getActiveAccountId(), "local", "no account yet");

  await setAuth({ user: { id: "user-a" } });
  const sets = await getStudySets();
  assert.equal(sets.length, 1, "the first account to sign in inherits it");
  assert.equal(sets[0].id, "orphan");
  assert.equal(await getLastSync(), null, "but not a sync cursor it never earned");
});

await test("adopting never overwrites what the account already has", async () => {
  await setAuth({ user: { id: "user-a" } });
  await saveStudySet({ id: "mine", sessionId: "s-m", flashcards: [] });
  await logout();
  await switchActiveAccount("local");
  await saveStudySet({ id: "orphan", sessionId: "s-o", flashcards: [] });

  await setAuth({ user: { id: "user-a" } });
  const sets = await getStudySets();
  assert.equal(sets.length, 1);
  assert.equal(sets[0].id, "mine", "A's own sets win");
});

await test("another context switching account drops this one's cached id", async () => {
  // The panel and the service worker each cache the id. Without the storage
  // listener the worker keeps filing captures under the account that just left.
  await setAuth({ user: { id: "user-a" } });
  assert.equal(await getActiveAccountId(), "user-a");
  changed({ activeAccountId: { newValue: "user-b" } });
  assert.equal(await getActiveAccountId(), "user-b", "the cache must follow the change");
});

console.log(`\n${passed} passed`);

