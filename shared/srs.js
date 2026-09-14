// FSRS-6 spaced-repetition scheduling.
// Reference: open-spaced-repetition ts-fsrs / FSRS wiki

export const FSRS_WEIGHTS = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666,
  0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658,
  0.1542
];

const DAY_MS = 24 * 60 * 60 * 1000;
const DECAY = -FSRS_WEIGHTS[20];
const FACTOR = Math.exp((1 / DECAY) * Math.log(0.9)) - 1;

function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

function roundTo(val, digits = 8) {
  const factor = Math.pow(10, digits);
  return Math.round(val * factor) / factor;
}

/** Fresh scheduling fields for a new card (due immediately). */
export function initSchedule(now = Date.now()) {
  return { 
    easiness: 2.5, 
    interval: 0, 
    repetitions: 0, 
    dueDate: now,
    state: "new",
    lapses: 0,
    stability: undefined,
    difficulty: undefined,
    lastReview: undefined
  };
}

function easinessToDifficulty(easiness) {
  if (easiness >= 3.0) return 1;
  if (easiness >= 2.5) {
    return 5 - ((easiness - 2.5) / 0.5) * 4;
  }
  return 10 - ((easiness - 1.3) / 1.2) * 5;
}

/**
 * Apply an FSRS review to a card's schedule.
 */
export function review(card, grade, now = Date.now(), examDate) {
  // Convert grade 0(Again), 3(Hard), 4(Good), 5(Easy) to FSRS grade 1-4.
  let fsrsGrade = 1; // Again
  if (grade === 3) fsrsGrade = 2; // Hard
  if (grade >= 4) fsrsGrade = grade - 1; // 4->3(Good), 5->4(Easy)

  // Migrate SM-2 to FSRS
  let { stability, difficulty, state = "new", lapses = 0, lastReview, repetitions = 0, easiness = 2.5, interval = 0 } = card;
  
  if (repetitions > 0 && stability === undefined) {
    stability = Math.max(1, interval || 1);
    difficulty = clamp(easinessToDifficulty(easiness), 1, 10);
    state = "review";
  }

  // Calculate elapsed days 't'
  let t = 0;
  if (lastReview !== undefined) {
    t = Math.max(0, (now - lastReview) / DAY_MS);
  } else if (card.dueDate && interval) {
    t = Math.max(0, (now - (card.dueDate - interval * DAY_MS)) / DAY_MS);
  }
  if (state === "new") t = 0;

  const w = FSRS_WEIGHTS;
  let new_s, new_d;

  if (state === "new") {
    new_d = clamp(w[4] - Math.exp((fsrsGrade - 1) * w[5]) + 1, 1, 10);
    new_s = Math.max(w[fsrsGrade - 1], 0.1);
    state = fsrsGrade === 1 ? "learning" : "review";
  } else {
    // Retrievability
    const r = retrievability({ stability, state, lastReview, dueDate: card.dueDate, interval, repetitions }, now) || 0;
    
    // Next Difficulty
    const delta_d = -w[6] * (fsrsGrade - 3);
    const next_d = difficulty + delta_d * (10 - difficulty) / 9;
    const init_d4 = clamp(w[4] - Math.exp((4 - 1) * w[5]) + 1, 1, 10);
    new_d = clamp(w[7] * init_d4 + (1 - w[7]) * next_d, 1, 10);

    if (fsrsGrade === 1) {
      // Again (lapse)
      new_s = w[11] * Math.pow(difficulty, -w[12]) * (Math.pow(stability + 1, w[13]) - 1) * Math.exp((1 - r) * w[14]);
      new_s = clamp(new_s, 0.01, 36500);
      state = "relearning";
      lapses += 1;
    } else {
      // Hard, Good, Easy
      const hard_penalty = fsrsGrade === 2 ? w[15] : 1;
      const easy_bound = fsrsGrade === 4 ? w[16] : 1;
      new_s = stability * (1 + Math.exp(w[8]) * (11 - difficulty) * Math.pow(stability, -w[9]) * (Math.exp((1 - r) * w[10]) - 1) * hard_penalty * easy_bound);
      new_s = clamp(new_s, 0.01, 36500);
      if (state === "learning" || state === "relearning") {
        state = "review";
      }
    }
  }

  new_d = roundTo(new_d, 8);
  new_s = roundTo(new_s, 8);

  let nextInterval = Math.max(1, Math.round(new_s));
  if (state === "learning" || state === "relearning") {
    nextInterval = 1;
  }
  nextInterval = Math.min(nextInterval, 365);
  
  if (fsrsGrade === 1) {
    repetitions = 0;
  } else {
    repetitions += 1;
  }

  // Update easiness for SM-2 backwards compatibility
  easiness = easiness + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
  if (easiness < 1.3) easiness = 1.3;

  let dueDate = now + nextInterval * DAY_MS;
  if (examDate && examDate > now) {
    const latest = Math.max(examDate - DAY_MS / 2, now + 10 * 60 * 1000);
    dueDate = Math.min(dueDate, latest);
  }

  return { 
    easiness: Number(easiness.toFixed(2)), 
    interval: nextInterval, 
    repetitions, 
    dueDate,
    stability: new_s,
    difficulty: new_d,
    state,
    lapses,
    lastReview: now
  };
}

export function retrievability(card, now = Date.now()) {
  let { stability, state, interval, dueDate, lastReview } = card;
  if (stability === undefined && card.repetitions > 0) {
    stability = Math.max(1, interval || 1);
  }
  if (!stability || state === "new") return null;
  
  let t = 0;
  if (lastReview !== undefined) {
    t = Math.max(0, (now - lastReview) / DAY_MS);
  } else if (dueDate && interval) {
    t = Math.max(0, (now - (dueDate - interval * DAY_MS)) / DAY_MS);
  }
  return Math.pow(1 + (FACTOR * t) / stability, DECAY);
}

export function isDue(card, now = Date.now()) {
  return (card.dueDate ?? 0) <= now;
}

export function byDue(a, b) {
  return (a.dueDate ?? 0) - (b.dueDate ?? 0);
}

export function masteryOf(card) {
  if (card.state === "review" && card.stability >= 7) return "mastered";
  
  const reps = card.repetitions ?? 0;
  const interval = card.interval ?? 0;
  if (card.stability === undefined) {
    if (reps >= 3 || (reps >= 2 && interval >= 6)) return "mastered";
  }
  
  if (reps >= 1 || card.state === "learning" || card.state === "relearning") return "learning";
  return "new";
}
