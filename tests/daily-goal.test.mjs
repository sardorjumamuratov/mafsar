import test from "node:test";
import assert from "node:assert/strict";
import { computeDailyGoal, fadingSoon } from "../shared/daily-goal.js";

const DAY = 86_400_000;
const now = new Date(2026, 8, 30, 10, 0, 0).getTime();
const due = (id) => ({ id, front: id, back: "", dueDate: now - DAY, repetitions: 1, interval: 1, state: "review", stability: 1, lastReview: now - 2 * DAY });
const later = (id) => ({ id, front: id, back: "", dueDate: now + 10 * DAY, repetitions: 3, interval: 10, state: "review", stability: 10, lastReview: now - DAY });

test("no exam: goal is every due card, capped at 40", () => {
  const sets = [{ sessionId: "a", flashcards: Array.from({ length: 50 }, (_, i) => due("c" + i)) }];
  const g = computeDailyGoal(sets, now);
  assert.equal(g.totalDue, 50);
  assert.equal(g.goalCount, 40);
  assert.equal(g.setCount, 1);
  assert.equal(g.goalMinutes, Math.round((40 * 22) / 60));
});

// Due but mature (a 10-day interval): not a Learning card.
const dueMature = (id) => ({ ...due(id), interval: 10, stability: 10, repetitions: 5, lastReview: now - 11 * DAY });

test("with an exam, the goal spreads the due cards over the days left", () => {
  const sets = [{ sessionId: "a", examDate: now + 5 * DAY, flashcards: Array.from({ length: 20 }, (_, i) => dueMature("c" + i)) }];
  const g = computeDailyGoal(sets, now);
  assert.equal(g.daysUntilExam, 5);
  assert.equal(g.learningDueToday, 0);
  assert.equal(g.goalCount, 4);
});

test("learning cards due today are added on top of the spread (the design's formula)", () => {
  const sets = [{ sessionId: "a", examDate: now + 5 * DAY, flashcards: [...Array.from({ length: 10 }, (_, i) => dueMature("m" + i)), due("l1"), due("l2")] }];
  const g = computeDailyGoal(sets, now);
  assert.equal(g.learningDueToday, 2);
  assert.equal(g.goalCount, Math.min(12, Math.ceil(12 / 5) + 2));
});

test("an exam in the past counts as no exam", () => {
  const sets = [{ sessionId: "a", examDate: now - DAY, flashcards: [due("x")] }];
  const g = computeDailyGoal(sets, now);
  assert.equal(g.nearestExam, null);
  assert.equal(g.goalCount, 1);
});

test("nothing due gives a zero goal", () => {
  const g = computeDailyGoal([{ sessionId: "a", flashcards: [later("x")] }], now);
  assert.equal(g.totalDue, 0);
  assert.equal(g.goalCount, 0);
  assert.equal(g.goalMinutes, 0);
});

test("fading soon skips due cards and cards that stay above the retention target", () => {
  const sets = [{ sessionId: "a", flashcards: [due("d"), later("safe")] }];
  const out = fadingSoon(sets, now);
  assert.ok(!out.some((x) => x.card.id === "d"), "a due card is not 'fading'");
  assert.ok(!out.some((x) => x.card.id === "safe"), "a 10-day card reviewed yesterday is safe");
});
