// Pure-logic tests for the client features (readiness math, interval
// clamping, weak-topic ranking). Run: node tests/client-logic.test.mjs

import assert from "node:assert/strict";
import { review } from "../shared/srs.js";
import { examReadiness, nextExam, weakTopics } from "../shared/readiness.js";

const DAY = 24 * 60 * 60 * 1000;
let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

// --- interval clamping to exam date -----------------------------------------
console.log("interval clamping");
const now = Date.now();
const exam = now + 10 * DAY;
const mature = { easiness: 2.5, interval: 30, repetitions: 5 };

test("long interval is clamped to the exam date", () => {
  const out = review(mature, 5, now, exam);
  assert.ok(out.dueDate <= exam, `dueDate ${out.dueDate} > exam ${exam}`);
});

test("short interval is left alone", () => {
  const out = review({ easiness: 2.5, interval: 0, repetitions: 0 }, 4, now, exam);
  assert.equal(out.dueDate, now + out.interval * DAY);
});

test("no examDate behaves like before", () => {
  const a = review(mature, 5, now);
  const b = review(mature, 5, now, undefined);
  assert.equal(a.dueDate, b.dueDate);
});

test("past exam date is ignored (no clamping backwards)", () => {
  const out = review(mature, 5, now, now - DAY);
  assert.equal(out.dueDate, now + out.interval * DAY);
});

// --- readiness math -----------------------------------------------------------
console.log("exam readiness");
test("daily target = ceil(remaining / daysLeft)", () => {
  const r = examReadiness({ examDate: now + 10 * DAY, total: 100, mastered: 10, due: 0 });
  assert.equal(r.daysLeft, 10);
  assert.equal(r.dailyTarget, Math.ceil(90 / 10)); // 9
});

test("on track vs behind", () => {
  const onTrack = examReadiness({ examDate: now + 30 * DAY, total: 100, mastered: 80, due: 0 });
  const behind = examReadiness({ examDate: now + 3 * DAY, total: 100, mastered: 5, due: 0 }); // 95/3 ≈ 32/day
  assert.equal(onTrack.status, "on-track");
  assert.equal(behind.status, "behind");
});

test("today and past exams", () => {
  assert.equal(examReadiness({ examDate: now + DAY / 2, total: 1, mastered: 0, due: 1 }).status, "today");
  assert.equal(examReadiness({ examDate: now - DAY, total: 1, mastered: 1, due: 0 }).status, "past");
});

test("next exam picks the soonest future date", () => {
  const sets = [
    { sessionId: "a", title: "A", examDate: now + 5 * DAY },
    { sessionId: "b", title: "B", examDate: now + 2 * DAY },
    { sessionId: "c", title: "C", examDate: now - 1 * DAY }, // past — ignored
  ];
  const next = nextExam(sets, [{ id: "b", title: "B" }]);
  assert.equal(next.sessionId, "b");
  assert.equal(nextExam([{ sessionId: "c", examDate: now - DAY }], []), null);
});

// --- weak-topic ranking -------------------------------------------------------


console.log("weak topics");
const cards = [
  { id: "c1", front: "One", due: 0, easiness: 1.5, repetitions: 2, sessionId: "set1" },
  { id: "c2", front: "Two", due: 0, easiness: 2.5, repetitions: 1, sessionId: "set2" },
  { id: "c3", front: "Three", due: 0, easiness: 2.5, repetitions: 1, sessionId: "set3" },
];

test("A card rated only Hard is included, with misses === 0 and hards === 1", () => {
  const log = [{ cardId: "c1", grade: 3, at: now }];
  const weak = weakTopics(log, cards, now);
  assert.equal(weak.length, 1);
  assert.equal(weak[0].misses, 0);
  assert.equal(weak[0].hards, 1);
  assert.equal(weak[0].sessionId, "set1");
});

test("A card rated only Good or Easy is not included", () => {
  const log = [{ cardId: "c1", grade: 4, at: now }, { cardId: "c2", grade: 5, at: now }, { cardId: "c3", grade: 5, at: now }];
  assert.equal(weakTopics(log, cards, now).length, 0);
});

test("A card with an early Again followed by two Goods is excluded (recovered)", () => {
  const log = [{ cardId: "c3", grade: 0, at: now }, { cardId: "c3", grade: 4, at: now + 1 }, { cardId: "c3", grade: 5, at: now + 2 }];
  assert.equal(weakTopics(log, cards, now).length, 0);
});

test("Only the last 5 rows count: 6 old Agains followed by 5 Goods means excluded", () => {
  const log = [
    { cardId: "c3", grade: 0, at: 1 },
    { cardId: "c3", grade: 0, at: 2 },
    { cardId: "c3", grade: 0, at: 3 },
    { cardId: "c3", grade: 0, at: 4 },
    { cardId: "c3", grade: 0, at: 5 },
    { cardId: "c3", grade: 0, at: 6 },
    { cardId: "c3", grade: 4, at: 7 },
    { cardId: "c3", grade: 4, at: 8 },
    { cardId: "c3", grade: 4, at: 9 },
    { cardId: "c3", grade: 4, at: 10 },
    { cardId: "c3", grade: 4, at: 11 }
  ];
  assert.equal(weakTopics(log, cards, now).length, 0);
});

test("ignores log entries for deleted cards", () => {
  const log = [{ cardId: "gone", grade: 0, at: now }];
  assert.equal(weakTopics(log, cards, now).length, 0);
});

console.log(`\n${passed} tests passed`);

