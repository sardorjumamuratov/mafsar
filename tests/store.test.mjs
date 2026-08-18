// Store-level regression tests with a stubbed chrome.storage.
// Run: node tests/store.test.mjs

// ---- chrome.* mock -----------------------------------------------------------
const DATA = {};
globalThis.chrome = {
  storage: {
    local: {
      get(key, cb) {
        const keys = Array.isArray(key) ? key : [key];
        const out = {};
        for (const k of keys) if (DATA[k] !== undefined) out[k] = JSON.parse(JSON.stringify(DATA[k]));
        setTimeout(() => cb(out), 0);
      },
      set(obj, cb) {
        for (const [k, v] of Object.entries(obj)) DATA[k] = JSON.parse(JSON.stringify(v));
        setTimeout(() => cb && cb(), 0);
      },
    },
  },
};

const assert = (await import("node:assert/strict")).default;
const store = await import("../src/storage/store.js");
const { initSchedule } = await import("../src/storage/srs.js");

let passed = 0;
async function test(name, fn) {
  for (const k of Object.keys(DATA)) delete DATA[k];
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("regeneration preserves user fields (the examDate-wipe regression)");

await test("regenerate pattern keeps examDate/mode/summary", async () => {
  const session = await store.addSession({ source: "chatgpt", title: "Torts", messages: [] });
  await store.saveStudySet({
    sessionId: session.id, title: "Torts", mode: "law",
    examDate: 1756000000000, createdAt: 1,
    flashcards: [{ id: "c1", front: "Q", back: "A", ...initSchedule() }],
    quiz: [],
  });
  await store.setExamDate(session.id, 1756999999999);

  // The service-worker regeneration pattern: merge generated content with
  // the existing record's user-set fields instead of replacing wholesale.
  const existing = await store.getStudySetForSession(session.id);
  await store.saveStudySet({
    sessionId: session.id,
    title: existing?.title ?? session.title,
    mode: existing?.mode,
    examDate: existing?.examDate ?? null,
    summary: existing?.summary,
    createdAt: existing?.createdAt ?? Date.now(),
    flashcards: [{ id: "c9", front: "New", back: "Card", ...initSchedule() }],
    quiz: [],
  });

  const after = await store.getStudySetForSession(session.id);
  assert.equal(after.examDate, 1756999999999, "examDate survived regeneration");
  assert.equal(after.mode, "law", "mode survived regeneration");
  assert.equal(after.flashcards.length, 1);
  assert.equal(after.flashcards[0].front, "New");
});

await test("a naive replace DOES wipe examDate (documents the old bug)", async () => {
  const session = await store.addSession({ source: "chatgpt", title: "T", messages: [] });
  await store.saveStudySet({ sessionId: session.id, title: "T", examDate: 123, flashcards: [], quiz: [] });
  // What the old service worker did — no preserved fields:
  await store.saveStudySet({ sessionId: session.id, title: "T", createdAt: Date.now(), flashcards: [], quiz: [] });
  const after = await store.getStudySetForSession(session.id);
  assert.ok(after.examDate == null, "naive replace loses examDate — SW must use the merged pattern");
});

console.log("tombstones + filtered getters");

await test("deleteSession tombstones and hides the set", async () => {
  const session = await store.addSession({ source: "chatgpt", title: "T", messages: [] });
  await store.saveStudySet({ sessionId: session.id, title: "T", flashcards: [], quiz: [] });
  await store.deleteSession(session.id);
  assert.equal((await store.getSessions()).length, 0, "session hidden from UI list");
  assert.equal((await store.getStudySets()).length, 0, "set hidden from UI list");
  // raw record kept for sync
  const raw = await store.readRaw(["studySets"]);
  assert.equal(raw.studySets[0].deleted, true, "tombstone kept in raw storage");
});

await test("deleteCard tombstones and hides the card", async () => {
  const session = await store.addSession({ source: "chatgpt", title: "T", messages: [] });
  await store.saveStudySet({
    sessionId: session.id, title: "T",
    flashcards: [{ id: "c1", front: "Q", back: "A", ...initSchedule() }], quiz: [],
  });
  await store.deleteCard(session.id, "c1");
  const sets = await store.getStudySets();
  assert.equal(sets[0].flashcards.length, 0, "card hidden from UI copy");
  const raw = await store.readRaw(["studySets"]);
  assert.equal(raw.studySets[0].flashcards[0].deleted, true, "card tombstone kept");
});

await test("updateCard stamps updatedAt on card and set", async () => {
  const session = await store.addSession({ source: "chatgpt", title: "T", messages: [] });
  const set = await store.saveStudySet({
    sessionId: session.id, title: "T",
    flashcards: [{ id: "c1", front: "Q", back: "A", ...initSchedule() }], quiz: [],
  });
  const before = set.updatedAt;
  await new Promise((r) => setTimeout(r, 5));
  await store.updateCard(session.id, "c1", { interval: 6 });
  const raw = await store.readRaw(["studySets"]);
  assert.ok(raw.studySets[0].flashcards[0].updatedAt > before, "card stamped");
  assert.ok(raw.studySets[0].updatedAt > before, "set stamped");
});

console.log("SRS persistence round-trip (grade → storage → re-read)");

await test("updateCard persists a graded schedule that isDue() agrees with", async () => {
  const { review, isDue } = await import("../src/storage/srs.js");
  const session = await store.addSession({ source: "chatgpt", title: "T", messages: [] });
  const now = Date.now();
  const card = { id: "c1", front: "Q", back: "A", easiness: 2.5, interval: 0, repetitions: 0, dueDate: now };
  await store.saveStudySet({ sessionId: session.id, title: "T", flashcards: [card], quiz: [] });

  // Grade "Good": dueDate moves to +1 day, so the card must stop being due.
  const upd = review(card, 4, now);
  await store.updateCard(session.id, "c1", upd);
  const reread = (await store.getStudySetForSession(session.id)).flashcards[0];
  assert.equal(reread.dueDate, upd.dueDate, "dueDate survived the storage round-trip");
  assert.equal(reread.repetitions, 1);
  assert.equal(reread.interval, 1);
  assert.equal(isDue(reread, now), false, "graded card is not due at grading time");
  assert.equal(isDue(reread, now + 25 * 60 * 60 * 1000), true, "becomes due a day later");

  // Grade "Again" the next day: schedule resets, and (panel-level) requeue
  // relies on the stored card still being findable by id.
  const lapse = review(reread, 0, now + 26 * 60 * 60 * 1000);
  await store.updateCard(session.id, "c1", lapse);
  const after = (await store.getStudySetForSession(session.id)).flashcards[0];
  assert.equal(after.repetitions, 0, "lapse persisted");
  assert.equal(after.dueDate, lapse.dueDate);
});


console.log(`
${passed} tests passed`);
