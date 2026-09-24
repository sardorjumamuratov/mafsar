// Store-level regression tests with a stubbed chrome.storage.
// Run: node tests/store.test.mjs

// ---- chrome.* mock -----------------------------------------------------------
const DATA = {};
globalThis.chrome = {
  storage: {
    local: {
      get(key, cb) {
        const out = {};
        if (key == null) {
          // chrome.storage.local.get(null) returns everything — exportAll uses this.
          for (const [k, v] of Object.entries(DATA)) out[k] = JSON.parse(JSON.stringify(v));
        } else {
          const keys = Array.isArray(key) ? key : [key];
          for (const k of keys) if (DATA[k] !== undefined) out[k] = JSON.parse(JSON.stringify(DATA[k]));
        }
        setTimeout(() => cb(out), 0);
      },
      set(obj, cb) {
        for (const [k, v] of Object.entries(obj)) DATA[k] = JSON.parse(JSON.stringify(v));
        setTimeout(() => cb && cb(), 0);
      },
      clear(cb) {
        for (const k of Object.keys(DATA)) delete DATA[k];
        setTimeout(() => cb && cb(), 0);
      },
    },
  },
};

const assert = (await import("node:assert/strict")).default;
const store = await import("../src/storage/store.js");
const { initSchedule } = await import("../shared/srs.js");

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

await test("a save that omits a field no longer wipes it", async () => {
  // This used to be the documented bug: saveStudySet replaced the record, so a
  // caller that didn't repeat examDate lost it. It now merges over what's
  // stored, which is also what keeps tombstones alive (see the tombstone tests).
  const session = await store.addSession({ source: "chatgpt", title: "T", messages: [] });
  await store.saveStudySet({ sessionId: session.id, title: "T", examDate: 123, flashcards: [], quiz: [] });
  await store.saveStudySet({ sessionId: session.id, title: "T", createdAt: Date.now(), flashcards: [], quiz: [] });
  const after = await store.getStudySetForSession(session.id);
  assert.equal(after.examDate, 123, "a field the caller didn't mention survives");
  // Clearing is explicit, through the function that owns it.
  await store.setExamDate(session.id, null);
  assert.equal((await store.getStudySetForSession(session.id)).examDate, null);
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
  const { review, isDue } = await import("../shared/srs.js");
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
  assert.equal(reread.interval, 2);
  assert.equal(isDue(reread, now), false, "graded card is not due at grading time");
  assert.equal(isDue(reread, now + 49 * 60 * 60 * 1000), true, "becomes due two days later");

  // Grade "Again" the next day: schedule resets, and (panel-level) requeue
  // relies on the stored card still being findable by id.
  const lapse = review(reread, 0, now + 26 * 60 * 60 * 1000);
  await store.updateCard(session.id, "c1", lapse);
  const after = (await store.getStudySetForSession(session.id)).flashcards[0];
  assert.equal(after.repetitions, 0, "lapse persisted");
  assert.equal(after.dueDate, lapse.dueDate);
});


console.log("saveStudySet stamps a fresh updatedAt (the stale-stamp regression)");

await test("re-saving a record that carries updatedAt still bumps the stamp", async () => {
  const session = await store.addSession({ source: "chatgpt", title: "T", messages: [] });
  const STALE = "2000-01-01T00:00:00.000Z";
  // The SUMMARIZE / GET_BLURB handlers pass the stored record (which already
  // has an updatedAt) straight back to saveStudySet. It must re-stamp, or
  // last-write-wins sync can't tell the row changed.
  const saved = await store.saveStudySet({
    sessionId: session.id, title: "T", updatedAt: STALE, flashcards: [], quiz: [],
  });
  assert.notEqual(saved.updatedAt, STALE, "must not carry the input's stale updatedAt");
  assert.ok(saved.updatedAt > STALE, "a fresh, newer stamp is written");
  const raw = await store.readRaw(["studySets"]);
  assert.ok(raw.studySets[0].updatedAt > STALE, "the stored row is stamped too");
});

await test("saveStudySet defaults a real id even when the input id is undefined", async () => {
  const session = await store.addSession({ source: "chatgpt", title: "T", messages: [] });
  const saved = await store.saveStudySet({ sessionId: session.id, id: undefined, title: "T", flashcards: [], quiz: [] });
  assert.ok(saved.id, "id defaulted, not left undefined");
});

console.log("getStudySets hides tombstoned quiz questions (parity with flashcards)");

await test("a deleted quiz question is hidden from the UI getter but kept raw", async () => {
  const session = await store.addSession({ source: "chatgpt", title: "T", messages: [] });
  await store.saveStudySet({
    sessionId: session.id, title: "T",
    flashcards: [{ id: "c1", front: "Q", back: "A", ...initSchedule() }],
    quiz: [
      { id: "q1", q: "live?", options: ["a", "b"], answer: 0 },
      { id: "q2", q: "gone?", options: ["a", "b"], answer: 0, deleted: true },
    ],
  });
  const sets = await store.getStudySets();
  assert.equal(sets[0].quiz.length, 1, "tombstoned quiz question hidden from UI");
  assert.equal(sets[0].quiz[0].id, "q1");
  const raw = await store.readRaw(["studySets"]);
  assert.equal(raw.studySets[0].quiz.length, 2, "tombstone kept in raw storage for sync");
});

console.log("settings defaults + merge");

await test("getSettings merges over the defaults", async () => {
  const def = await store.getSettings();
  assert.equal(def.openInTab, false);
  await store.saveSettings({ openInTab: true });
  const merged = await store.getSettings();
  assert.equal(merged.openInTab, true);
});

await test("a personal LLM key left by an old build is scrubbed on read", async () => {
  // The extension called the model directly before the backend existed, so an
  // early user still has their own key sitting in local storage, unused.
  await store.saveRaw({ settings: { provider: "gemini", apiKey: "sk-live-secret", model: "x", openInTab: true } });
  const settings = await store.getSettings();
  assert.equal(settings.apiKey, undefined, "the key is gone from what callers see");
  assert.equal(settings.openInTab, true, "real settings survive the scrub");
  const stored = await store.readRaw(["settings"]);
  assert.equal(stored.settings.apiKey, undefined, "and gone from disk, not just hidden");
  assert.equal(stored.settings.provider, undefined);
  assert.equal(stored.settings.model, undefined);
});

console.log("activity, streaks, and the 7-day view");

const dk = store.dayKey;
function keyDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dk(d);
}

await test("bumpActivity accumulates today's count", async () => {
  await store.bumpActivity(2);
  await store.bumpActivity(3);
  const activity = await store.getActivity();
  assert.equal(activity[keyDaysAgo(0)], 5);
});

await test("computeStreak counts consecutive days, tolerating an empty today", () => {
  assert.equal(store.computeStreak({}), 0);
  assert.equal(store.computeStreak({ [keyDaysAgo(0)]: 1, [keyDaysAgo(1)]: 1, [keyDaysAgo(2)]: 1 }), 3);
  // Nothing yet today, but yesterday and before keep the streak alive.
  assert.equal(store.computeStreak({ [keyDaysAgo(1)]: 1, [keyDaysAgo(2)]: 1 }), 2);
  // A one-day gap breaks it.
  assert.equal(store.computeStreak({ [keyDaysAgo(0)]: 1, [keyDaysAgo(2)]: 1 }), 1);
});

await test("weekActivity returns 7 oldest-first days ending today", () => {
  const week = store.weekActivity({ [keyDaysAgo(0)]: 4, [keyDaysAgo(6)]: 1 });
  assert.equal(week.length, 7);
  assert.equal(week[6].isToday, true);
  assert.equal(week[6].key, keyDaysAgo(0));
  assert.equal(week[6].count, 4);
  assert.equal(week[0].key, keyDaysAgo(6));
  assert.equal(week[0].count, 1);
  assert.equal(week.filter((d) => d.isToday).length, 1, "exactly one day is 'today'");
});

console.log("review log cap");

await test("appendReviewLog caps the log by dropping rows the server already has", async () => {
  const seed = Array.from({ length: 2000 }, (_, i) => ({ id: "r" + i, cardId: "c", grade: 3, reviewedAt: "2026-01-01T00:00:00.000Z" }));
  await store.saveRaw({ reviewLog: seed, lastSync: "2026-01-15T00:00:00.000Z" });
  await store.appendReviewLog({ id: "newest", cardId: "c", grade: 5, reviewedAt: "2026-02-01T00:00:00.000Z" });
  const log = await store.getReviewLog();
  assert.equal(log.length, 2000, "capped at 2000");
  assert.equal(log[log.length - 1].id, "newest", "newest retained");
  assert.equal(log[0].id, "r1", "oldest (r0) dropped");
});

await test("an unsynced row is never dropped to meet the cap", async () => {
  // A long stretch offline must not cost reviews: they are the only copy.
  const seed = Array.from({ length: 2000 }, (_, i) => ({ id: "s" + i, cardId: "c", grade: 3, reviewedAt: "2026-01-01T00:00:00.000Z" }));
  const offline = Array.from({ length: 50 }, (_, i) => ({ id: "u" + i, cardId: "c", grade: 4, reviewedAt: "2026-03-01T00:00:00.000Z" }));
  await store.saveRaw({ reviewLog: [...seed, ...offline], lastSync: "2026-01-15T00:00:00.000Z" });
  await store.appendReviewLog({ id: "newest", cardId: "c", grade: 5, reviewedAt: "2026-03-02T00:00:00.000Z" });
  const log = await store.getReviewLog();
  assert.equal(log.length, 2000, "still bounded");
  const kept = new Set(log.map((r) => r.id));
  for (const r of offline) assert.ok(kept.has(r.id), r.id + " was unsynced and must survive");
  assert.ok(kept.has("newest"));
});

console.log("addCard");

await test("addCard appends a fresh-scheduled card and stamps the set", async () => {
  const session = await store.addSession({ source: "chatgpt", title: "T", messages: [] });
  const set = await store.saveStudySet({ sessionId: session.id, title: "T", flashcards: [], quiz: [] });
  const card = await store.addCard(session.id, "Front?", "Back.");
  assert.ok(card.id);
  assert.equal(card.front, "Front?");
  assert.equal(card.easiness, 2.5, "starts with a fresh SM-2 schedule");
  assert.equal(card.repetitions, 0);
  const sets = await store.getStudySets();
  assert.equal(sets[0].flashcards.length, 1);
  assert.ok(sets[0].updatedAt >= set.updatedAt, "set re-stamped on add");
  assert.equal(await store.addCard("no-such-session", "x", "y"), null, "unknown session returns null");
});

console.log("backup / restore");

await test("exportAll round-trips through importAll; bad input is rejected", async () => {
  const session = await store.addSession({ source: "chatgpt", title: "Keep me", messages: [] });
  await store.saveStudySet({ sessionId: session.id, title: "Keep me", flashcards: [], quiz: [] });
  const backup = await store.exportAll();
  assert.ok(Array.isArray(backup.studySets), "export includes studySets");

  // Mutate, then restore from the backup — restore replaces everything.
  await store.addSession({ source: "chatgpt", title: "Added later", messages: [] });
  await store.importAll(backup);
  const sessions = await store.getSessions();
  assert.equal(sessions.length, 1, "restore replaced current data");
  assert.equal(sessions[0].title, "Keep me");

  await assert.rejects(() => store.importAll(null), /Mafsar backup/);
  await assert.rejects(() => store.importAll({ studySets: "nope" }), /Mafsar backup/);
});

console.log(`
${passed} tests passed`);
