// SM-2 scheduling tests: grade sequences, lapse/relearn paths, mastery
// transitions, exam clamp. Run: node tests/srs.test.mjs

import assert from "node:assert/strict";
import { initSchedule, review, isDue, byDue, masteryOf } from "../src/storage/srs.js";

const DAY = 24 * 60 * 60 * 1000;
let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("grade sequences (success path)");
test("fresh card, three Good grades: 1d → 6d → 15d", () => {
  const now = Date.now();
  let card = initSchedule(now);
  card = { ...card, ...review(card, 4, now) };
  assert.equal(card.interval, 1);
  card = { ...card, ...review(card, 4, now + DAY) };
  assert.equal(card.interval, 6);
  card = { ...card, ...review(card, 4, now + 7 * DAY) };
  assert.equal(card.interval, 15); // round(6 * 2.5)
  assert.ok(Math.abs(card.dueDate - (now + 7 * DAY + 15 * DAY)) < 1000);
});

test("Easy(5) grows easiness, Again(0) drops it toward the 1.3 floor", () => {
  let card = initSchedule();
  for (let i = 0; i < 5; i++) card = { ...card, ...review(card, 5) };
  assert.ok(card.easiness > 2.5, "easy grades raise easiness");
  for (let i = 0; i < 10; i++) card = { ...card, ...review(card, 0) };
  assert.ok(card.easiness <= 1.3 + 0.001, "easiness clamped at 1.3");
});

console.log("lapse path (relearning)");
test("Again resets repetitions and schedules +1 day, not immediately", () => {
  const now = Date.now();
  let card = initSchedule(now);
  card = { ...card, ...review(card, 4, now) }; // learning, interval 1
  const lapsed = review(card, 0, now + DAY);
  assert.equal(lapsed.repetitions, 0);
  assert.equal(lapsed.interval, 1);
  assert.ok(lapsed.dueDate - (now + DAY) >= DAY - 1000, "stored schedule stays day-level");
});

test("a lapsed card recovers on the next pass (reps climb from 0)", () => {
  let card = { easiness: 2.5, interval: 15, repetitions: 4 };
  card = { ...card, ...review(card, 1) }; // lapse
  assert.equal(card.repetitions, 0);
  card = { ...card, ...review(card, 4) }; // relearned pass
  assert.equal(card.repetitions, 1);
  assert.equal(card.interval, 1); // starts the ladder again, easiness kept lower
  assert.ok(card.easiness < 2.5);
});

console.log("mastery transitions");
test("new → learning → mastered within ~a week (reps 2 + 6d interval)", () => {
  let card = initSchedule();
  assert.equal(masteryOf(card), "new");
  card = { ...card, ...review(card, 4) };
  assert.equal(masteryOf(card), "learning");
  card = { ...card, ...review(card, 4) }; // interval jumps to 6
  assert.equal(masteryOf(card), "mastered");
});

test("reps 2 with a short interval is NOT mastered (ladder restarted)", () => {
  // e.g. lapsed then passed twice quickly — interval still 1
  assert.equal(masteryOf({ repetitions: 2, interval: 1, easiness: 2.5 }), "learning");
  assert.equal(masteryOf({ repetitions: 3, interval: 1, easiness: 2.5 }), "mastered", "reps 3 always mastered");
});

test("lapse drops a mastered card back to new", () => {
  let card = { easiness: 2.5, interval: 15, repetitions: 4 };
  card = { ...card, ...review(card, 0) };
  assert.equal(card.repetitions, 0);
  assert.equal(masteryOf(card), "new");
});

console.log("exam clamp");
test("long intervals clamp to half a day before the exam, never to the exam minute", () => {
  const now = Date.now();
  const exam = now + 10 * DAY;
  const out = review({ easiness: 2.5, interval: 30, repetitions: 5 }, 5, now, exam);
  assert.ok(out.dueDate <= exam - DAY / 2 + 1000, "clamped to exam-12h");
  assert.ok(out.dueDate > now, "still in the future");
});

test("clamp never schedules into the past when the exam is imminent", () => {
  const now = Date.now();
  const exam = now + 2 * 60 * 60 * 1000; // 2h to exam
  const out = review({ easiness: 2.5, interval: 30, repetitions: 5 }, 5, now, exam);
  assert.ok(out.dueDate > now, "at least a 10-minute cram window");
  assert.ok(out.dueDate <= exam, "never after the exam");
});

test("past exam dates are ignored", () => {
  const now = Date.now();
  const out = review({ easiness: 2.5, interval: 30, repetitions: 5 }, 5, now, now - DAY);
  assert.equal(out.dueDate, now + out.interval * DAY);
});

console.log("queue helpers");
test("isDue and byDue order a mixed queue", () => {
  const now = Date.now();
  const overdue = { dueDate: now - DAY };
  const future = { dueDate: now + DAY };
  assert.equal(isDue(overdue, now), true);
  assert.equal(isDue(future, now), false);
  assert.ok(byDue(overdue, future) < 0);
  assert.equal(isDue({}, now), true, "missing dueDate counts as due");
});

console.log(`\n${passed} tests passed`);
