import fs from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert";
import { saveStudySet, getStudySets, setLastSync, deleteCard } from "../src/storage/store.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

function mockStorage() {
  let store = {};
  return {
    get: (keys, cb) => cb(keys === null ? store : (typeof keys === "string" ? { [keys]: store[keys] } : store)),
    set: (obj, cb) => { Object.assign(store, obj); if (cb) cb(); },
    remove: (keys, cb) => { (Array.isArray(keys) ? keys : [keys]).forEach(k => delete store[k]); if (cb) cb(); },
    clear: (cb) => { store = {}; if (cb) cb(); },
    __dump: () => store
  };
}

global.chrome = {
  storage: { local: mockStorage() },
};

function readAll(dir, ext) {
  const files = [];
  for (const f of fs.readdirSync(dir)) {
    const p = join(dir, f);
    if (fs.statSync(p).isDirectory()) {
      files.push(...readAll(p, ext));
    } else if (p.endsWith(ext)) {
      files.push({ p, content: fs.readFileSync(p, "utf8") });
    }
  }
  return files;
}

const setFor = (id, sets) => sets.find(s => s.sessionId === id);

test("a tombstone surviving a save from a filtered read", async () => {
  global.chrome.storage.local = mockStorage();
  
  const s1 = await saveStudySet({
    sessionId: "s1",
    flashcards: [{ id: "c1", front: "f", back: "b", updatedAt: new Date(Date.now() - 10000).toISOString() }]
  });

  await deleteCard("s1", "c1");

  const sets = await getStudySets();
  const filtered = setFor("s1", sets);
  assert.strictEqual(filtered.flashcards.length, 0, "Card should be filtered out");

  await saveStudySet({ ...filtered, title: "New Title" });

  const raw = await new Promise(r => global.chrome.storage.local.get(null, r));
  const studySetsKey = Object.keys(raw).find(k => k.endsWith("studySets"));
  const c1 = raw[studySetsKey][0].flashcards[0];
  
  assert.strictEqual(c1.id, "c1");
  assert.strictEqual(c1.deleted, true, "Tombstone must survive save");
});

test("a delete made through the filtered read still taking effect", async () => {
  global.chrome.storage.local = mockStorage();

  await saveStudySet({
    sessionId: "s1",
    flashcards: [
      { id: "c1", front: "f", back: "b", updatedAt: new Date(Date.now() - 10000).toISOString() },
      { id: "c2", front: "f", back: "b", updatedAt: new Date(Date.now() - 10000).toISOString() }
    ]
  });

  const sets = await getStudySets();
  const filtered = setFor("s1", sets);

  const c2 = filtered.flashcards.find(c => c.id === "c2");
  c2.deleted = true;
  c2.updatedAt = new Date().toISOString();

  await saveStudySet(filtered);

  const raw = await new Promise(r => global.chrome.storage.local.get(null, r));
  const studySetsKey = Object.keys(raw).find(k => k.endsWith("studySets"));
  const savedC2 = raw[studySetsKey][0].flashcards.find(c => c.id === "c2");
  
  assert.strictEqual(savedC2.deleted, true, "Delete from filtered read must take effect");
});

test("a quiz-row tombstone surviving", async () => {
  global.chrome.storage.local = mockStorage();

  await saveStudySet({
    sessionId: "s1",
    quiz: [{ id: "q1", q: "q", deleted: true, updatedAt: new Date().toISOString() }]
  });

  const sets = await getStudySets();
  const filtered = setFor("s1", sets);
  assert.strictEqual(filtered.quiz.length, 0);

  await saveStudySet(filtered);

  const raw = await new Promise(r => global.chrome.storage.local.get(null, r));
  const studySetsKey = Object.keys(raw).find(k => k.endsWith("studySets"));
  assert.strictEqual(raw[studySetsKey][0].quiz[0].deleted, true, "Quiz tombstone must survive save");
});

test("guard test: no setFor directly into saveStudySet", () => {
  const files = readAll(join(__dirname, "../src/ui"), ".js");
  for (const file of files) {
    if (file.content.includes("setFor") && file.content.includes("saveStudySet") && !file.p.includes("sets.js") && !file.p.includes("import.js")) {
      assert.fail("UI file imports both setFor and saveStudySet, risking saving a filtered read. Use updateStudySet instead.");
    }
  }
});
