// SM-2 spaced-repetition scheduling.
// Each card stores: easiness (>=1.3), interval (days), repetitions, dueDate (ms).
// Grade the recall quality 0..5; 3+ counts as a successful recall.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Fresh scheduling fields for a new card (due immediately). */
export function initSchedule(now = Date.now()) {
  return { easiness: 2.5, interval: 0, repetitions: 0, dueDate: now };
}

/**
 * Apply an SM-2 review to a card's schedule.
 * @param {{easiness:number,interval:number,repetitions:number}} card
 * @param {number} grade 0..5
 * @param {number} now epoch ms
 * @param {number} [examDate] epoch ms — when set and in the future, the new
 *   dueDate is clamped to ≤ examDate so cards keep resurfacing before the exam.
 * @returns updated scheduling fields
 */
export function review(card, grade, now = Date.now(), examDate) {
  let { easiness = 2.5, interval = 0, repetitions = 0 } = card;
  grade = Math.max(0, Math.min(5, Math.round(grade)));

  if (grade < 3) {
    // Failed recall: reset repetitions, review again soon.
    repetitions = 0;
    interval = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) interval = 1;
    else if (repetitions === 2) interval = 6;
    else interval = Math.round(interval * easiness);
  }

  // Update easiness factor (bounded below at 1.3).
  easiness = easiness + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
  if (easiness < 1.3) easiness = 1.3;

  let dueDate = now + interval * DAY_MS;
  if (examDate && examDate > now) dueDate = Math.min(dueDate, examDate);
  return { easiness: Number(easiness.toFixed(2)), interval, repetitions, dueDate };
}

/** True if the card is due for review now. */
export function isDue(card, now = Date.now()) {
  return (card.dueDate ?? 0) <= now;
}

/** Sort due-first, then by soonest dueDate. */
export function byDue(a, b) {
  return (a.dueDate ?? 0) - (b.dueDate ?? 0);
}

/** Mastery bucket for a card, derived from SM-2 repetitions. */
export function masteryOf(card) {
  const reps = card.repetitions ?? 0;
  if (reps >= 3) return "mastered";
  if (reps >= 1) return "learning";
  return "new";
}
