// Quiz-length options for the set detail Quiz tab. Pure so it's unit-testable.
//
// With 20+ cards: Quick is a fixed 5-question sample, Half is half the set
// rounded to the nearest 5 (26 → 15, 29 → 15, 30 → 15, 40 → 20), Full is
// everything. Under 20 cards a picker is noise — one Full quiz.

export function quizLengths(total, available) {
  if (available <= 0) return [];
  const cap = (n) => Math.max(1, Math.min(available, n));
  const rows =
    total >= 20
      ? [
          ["Quick", cap(5)],
          ["Half", cap(Math.round(total / 2 / 5) * 5)],
          ["Full", cap(total)],
        ]
      : [["Full", cap(total)]];
  // An option capped to "everything we have" is really a Full quiz, and
  // duplicate lengths collapse (a set stored with 5 questions shows one
  // Full-5 button instead of three identical ones).
  return rows
    .map(([label, n]) => [n === available ? "Full" : label, n])
    .filter(([, n], i, all) => all.findIndex(([, m]) => m === n) === i);
}
