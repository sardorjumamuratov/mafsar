// Pure-mapping tests for the sync layer (local <-> server). Run:
//   node tests/sync-map.test.mjs

import assert from "node:assert/strict";
import { toServer, applyServer } from "../src/sync/map.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

// A representative local state: one session + set with two cards, a quiz,
// activity map, and one review.
const T = "2026-08-15T10:00:00.000Z";
const T2 = "2026-08-15T11:00:00.000Z";
const local = () => ({
  sessions: [
    { id: "sess1", source: "chatgpt", sourceLabel: "ChatGPT", title: "Torts", capturedAt: 1755252000000, messages: [{ role: "user", text: "hi" }] },
  ],
  studySets: [
    {
      id: "set1", sessionId: "sess1", title: "Torts", mode: "law",
      examDate: 1755400000000, createdAt: 1755252000000, updatedAt: T, deleted: false,
      flashcards: [
        { id: "c1", front: "Q1", back: "A1", easiness: 2.5, interval: 3, repetitions: 2, dueDate: 1755350000000, updatedAt: T, deleted: false },
        { id: "c2", front: "Q2", back: "A2", easiness: 2.3, interval: 1, repetitions: 1, dueDate: 1755300000000, updatedAt: T2, deleted: false },
      ],
      quiz: [
        { id: "q1", q: "2+2?", options: ["3", "4"], answer: 1, explain: "math", updatedAt: T, deleted: false },
      ],
    },
  ],
  activity: { "2026-08-14": 5, "2026-08-15": 2 },
  reviewLog: [
    { id: "r1", cardId: "c1", grade: 4, prevInterval: 1, newInterval: 3, reviewedAt: T2 },
  ],
});

console.log("toServer (local -> server)");
test("maps a studySet+session into a server set with id = session.id", () => {
  const out = toServer(local(), "");
  assert.equal(out.sets.length, 1);
  assert.equal(out.sets[0].id, "sess1");
  assert.equal(out.sets[0].mode, "law");
  assert.equal(out.sets[0].examDate, new Date(1755400000000).toISOString());
  assert.equal(out.sets[0].updatedAt, T);
  assert.equal(out.sets[0].deleted, false);
});

test("maps cards with ms->ISO dueDate and SM-2 fields", () => {
  const out = toServer(local(), "");
  assert.equal(out.cards.length, 2);
  const c1 = out.cards.find((c) => c.id === "c1");
  assert.equal(c1.setId, "sess1");
  assert.equal(c1.dueDate, new Date(1755350000000).toISOString());
  assert.equal(c1.easiness, 2.5);
});

test("maps quiz and activity", () => {
  const out = toServer(local(), "");
  assert.equal(out.quiz[0].id, "q1");
  assert.deepEqual(out.activity.find((a) => a.day === "2026-08-14"), { day: "2026-08-14", count: 5 });
});

test("only sends rows newer than lastSync", () => {
  const out = toServer(local(), T2); // everything at/older than T2 is excluded
  assert.equal(out.sets.length, 0);          // set.updatedAt = T < T2
  const c2 = out.cards.find((c) => c.id === "c2");
  assert.ok(!c2);                            // c2.updatedAt = T2, not > T2
  assert.equal(out.reviews.length, 0);
  // activity always sent (server max-merges)
  assert.equal(out.activity.length, 2);
});

test("skips orphan studySets without a session row", () => {
  const bad = local();
  bad.sessions = [];
  const out = toServer(bad, "");
  assert.equal(out.sets.length, 0);
  assert.equal(out.cards.length, 0);
});

console.log("applyServer (server -> local)");
test("round-trip: empty local + server payload reconstructs the set", () => {
  const push = toServer(local(), "");
  const resp = { serverTime: T2, ...push };
  const merged = applyServer(resp, { sessions: [], studySets: [], activity: {}, reviewLog: [] });

  assert.equal(merged.sessions.length, 1);
  assert.equal(merged.sessions[0].id, "sess1");
  assert.equal(merged.sessions[0].title, "Torts");
  assert.equal(merged.sessions[0].capturedAt, 1755252000000);

  assert.equal(merged.studySets.length, 1);
  const st = merged.studySets[0];
  assert.equal(st.sessionId, "sess1");
  assert.equal(st.mode, "law");
  assert.equal(st.examDate, 1755400000000); // ISO -> ms
  assert.equal(st.flashcards.length, 2);
  const c1 = st.flashcards.find((c) => c.id === "c1");
  assert.equal(c1.dueDate, 1755350000000);
  assert.equal(st.quiz.length, 1);
  assert.equal(merged.activity["2026-08-14"], 5);
  assert.equal(merged.reviewLog.length, 1);
});

test("round-trip preserves the captured transcript of an existing session", () => {
  const push = toServer(local(), "");
  const withMsgs = { sessions: [{ id: "sess1", title: "old", capturedAt: 1, messages: [{ role: "user", text: "keep me" }] }], studySets: [], activity: {}, reviewLog: [] };
  const merged = applyServer({ ...push }, withMsgs);
  assert.equal(merged.sessions[0].messages.length, 1);
  assert.equal(merged.sessions[0].messages[0].text, "keep me");
});

test("LWW: stale server card loses to newer local card", () => {
  const push = toServer(local(), "");
  const stale = { ...push, cards: [{ ...push.cards[0], front: "STALE", updatedAt: "2026-08-01T00:00:00.000Z" }] };
  const merged = applyServer(stale, local());
  const c1 = merged.studySets[0].flashcards.find((c) => c.id === "c1");
  assert.equal(c1.front, "Q1");
});

test("LWW: newer server card wins", () => {
  const push = toServer(local(), "");
  const fresh = { ...push, cards: [{ ...push.cards[0], front: "UPDATED", updatedAt: "2026-08-15T23:00:00.000Z" }] };
  const merged = applyServer(fresh, local());
  const c1 = merged.studySets[0].flashcards.find((c) => c.id === "c1");
  assert.equal(c1.front, "UPDATED");
});

test("tombstone: server delete marks the local set deleted", () => {
  const push = toServer(local(), "");
  const del = { ...push, sets: [{ ...push.sets[0], deleted: true, updatedAt: "2026-08-15T12:00:00.000Z" }] };
  const merged = applyServer(del, local());
  assert.equal(merged.studySets.find((s) => s.sessionId === "sess1").deleted, true);
});

test("tombstone: stale delete loses to newer local edit", () => {
  const push = toServer(local(), "");
  const staleDel = { ...push, sets: [{ ...push.sets[0], deleted: true, updatedAt: "2026-08-15T09:00:00.000Z" }] };
  const merged = applyServer(staleDel, local());
  assert.equal(merged.studySets.find((s) => s.sessionId === "sess1").deleted, false);
});

test("deleted server cards become local tombstones, not removals", () => {
  const push = toServer(local(), "");
  const delCard = { ...push, cards: [{ ...push.cards[1], deleted: true, updatedAt: "2026-08-15T12:00:00.000Z" }] };
  const merged = applyServer(delCard, local());
  const c2 = merged.studySets[0].flashcards.find((c) => c.id === "c2");
  assert.equal(c2.deleted, true); // kept so the tombstone can propagate
});

test("activity max-merges per day", () => {
  const resp = { activity: [{ day: "2026-08-15", count: 9 }, { day: "2026-08-14", count: 1 }] };
  const merged = applyServer(resp, local());
  assert.equal(merged.activity["2026-08-15"], 9); // 9 > 2
  assert.equal(merged.activity["2026-08-14"], 5); // 1 < 5
});

test("reviews merge by id without duplicates", () => {
  const resp = { reviews: [local().reviewLog[0], { id: "r2", cardId: "c2", grade: 3, reviewedAt: T }] };
  const merged = applyServer(resp, local());
  assert.equal(merged.reviewLog.length, 2);
});

test("applyServer does not mutate its input", () => {
  const before = JSON.stringify(local());
  applyServer({ sets: [{ id: "new", title: "X", createdAt: T, updatedAt: T, deleted: false }], cards: [], quiz: [], activity: [], reviews: [] }, local());
  assert.equal(JSON.stringify(local()), before);
});

console.log(`\n${passed} tests passed`);
