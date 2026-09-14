// FSRS scheduling tests
import assert from "node:assert/strict";
import { initSchedule, review, isDue, byDue, masteryOf, retrievability } from "../shared/srs.js";

const DAY = 24 * 60 * 60 * 1000;
let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ? ${name}`);
}

console.log("grade sequences (success path)");
test("fresh card, three Good grades (FSRS intervals grow)", () => {
  const now = Date.now();
  let card = initSchedule(now);
  
  // Grade Good (4 in UI -> 3 FSRS)
  card = { ...card, ...review(card, 4, now) };
  assert.equal(card.state, "review");
  assert.equal(card.interval, 2); // w[2] = 2.3065
  
  // Another Good after 2 days
  card = { ...card, ...review(card, 4, now + 2 * DAY) };
  assert.ok(card.interval > 2); // It should grow
  assert.ok(card.stability > 2.3065);
  
  // Another Good after 5 days
  card = { ...card, ...review(card, 4, now + (2 + 5) * DAY) };
  assert.ok(card.interval > 5);
});

test("Easy(5) gives longest interval, Again(1) gives shortest", () => {
  const now = Date.now();
  let cAgain = { ...initSchedule(now), ...review(initSchedule(now), 0, now) };
  let cHard = { ...initSchedule(now), ...review(initSchedule(now), 3, now) };
  let cGood = { ...initSchedule(now), ...review(initSchedule(now), 4, now) };
  let cEasy = { ...initSchedule(now), ...review(initSchedule(now), 5, now) };
  
  assert.ok(cAgain.interval <= cHard.interval);
  assert.ok(cHard.interval < cGood.interval);
  assert.ok(cGood.interval < cEasy.interval);
});

console.log("lapse path (relearning)");
test("Again pushes to relearning and increments lapses", () => {
  const now = Date.now();
  let card = initSchedule(now);
  card = { ...card, ...review(card, 4, now) }; // review
  const lapsed = review(card, 0, now + 2 * DAY);
  assert.equal(lapsed.state, "relearning");
  assert.equal(lapsed.lapses, 1);
  assert.equal(lapsed.interval, 1);
  assert.equal(lapsed.repetitions, 0);
});

test("a lapsed card recovers on the next pass", () => {
  const now = Date.now();
  let card = { state: "review", stability: 15, difficulty: 5, lapses: 0, interval: 15, repetitions: 4, lastReview: now - 15 * DAY };
  card = { ...card, ...review(card, 1, now) }; // lapse
  assert.equal(card.repetitions, 0);
  assert.equal(card.state, "relearning");
  
  card = { ...card, ...review(card, 4, now + 1 * DAY) }; // relearned pass
  assert.equal(card.repetitions, 1);
  assert.equal(card.state, "review");
  assert.ok(card.interval > 1); 
});

console.log("mastery transitions");
test("new > review > mastered when stability >= 7", () => {
  const now = Date.now();
  let card = initSchedule();
  assert.equal(masteryOf(card), "new");
  
  card = { ...card, ...review(card, 4, now) };
  // After first Good, stability is 2.3, so not mastered yet (needs >= 7)
  assert.equal(masteryOf(card), "learning");
  
  card = { ...card, ...review(card, 4, now + 2 * DAY) }; // stability grows to ~5
  if (card.stability < 7) {
     assert.equal(masteryOf(card), "learning");
     card = { ...card, ...review(card, 4, now + (2 + 5) * DAY) }; // stability grows > 7
  }
  assert.equal(masteryOf(card), "mastered");
});

test("lapse drops a mastered card back to learning (relearning)", () => {
  const now = Date.now();
  let card = { state: "review", stability: 15, difficulty: 5, repetitions: 4, interval: 15, lapses: 0, lastReview: now - 15 * DAY };
  card = { ...card, ...review(card, 0, now) };
  assert.equal(card.state, "relearning");
  assert.equal(masteryOf(card), "learning");
});

console.log("exam clamp");
test("long intervals clamp to half a day before the exam, never to the exam minute", () => {
  const now = Date.now();
  const exam = now + 10 * DAY;
  const out = review({ state: "review", stability: 30, difficulty: 5, repetitions: 5, interval: 30, lapses: 0, lastReview: now - 30 * DAY }, 5, now, exam);
  assert.ok(out.dueDate <= exam - DAY / 2 + 1000, "clamped to exam-12h");
  assert.ok(out.dueDate > now, "still in the future");
});

test("past exam dates are ignored", () => {
  const now = Date.now();
  const out = review({ state: "review", stability: 30, difficulty: 5, repetitions: 5, interval: 30, lapses: 0, lastReview: now - 30 * DAY }, 5, now, now - DAY);
  assert.equal(out.dueDate, now + out.interval * DAY);
});

console.log("migration");
test("SM-2 card migrates without resetting", () => {
  const now = Date.now();
  // An SM-2 card with interval 20 and reps 4
  const card = { easiness: 2.5, interval: 20, repetitions: 4, dueDate: now };
  const next = review(card, 4, now);
  
  assert.equal(next.state, "review");
  assert.ok(next.stability > 20, "stability grows from interval");
  assert.ok(next.interval > 20, "gets a longer interval, not reset to 1 day");
});

console.log("retrievability");
test("retrievability is 0.9 at t = stability", () => {
  const now = Date.now();
  const s = 10;
  const card = { state: "review", stability: s, lastReview: now - s * DAY };
  const r = retrievability(card, now);
  assert.ok(Math.abs(r - 0.9) < 0.001, `Expected ~0.9, got ${r}`);
});

console.log(`\n${passed} tests passed`);

