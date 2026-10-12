// Practice levels for the Medicine modes (docs/prompts/39). Pure, so it's unit
// tested in tests/practice-level.test.mjs.
//
// A level changes how hard the case is and how the answer is given. It is
// separate from the practice style, which changes how much help you get.

export const LEVELS = {
  beginner: {
    label: "Beginner",
    description: "A textbook case. Tap the answer from four options.",
    flags: { clinicalAnswers: "choice", chainAnswers: "choice", chainLength: 4 },
  },
  intermediate: {
    label: "Intermediate",
    description: "A trickier case. Pick the answer, then say why in a line.",
    flags: { clinicalAnswers: "choice+why", chainAnswers: "typed", chainLength: 6 },
  },
  advanced: {
    label: "Advanced",
    description: "An atypical case and a close differential. Type short answers.",
    flags: { clinicalAnswers: "typed", chainAnswers: "typed", chainLength: Infinity },
  },
};

export const LEVEL_IDS = Object.keys(LEVELS);
export const isLevel = (v) => LEVEL_IDS.includes(v);
export const levelLabel = (level) => (LEVELS[level] || LEVELS.beginner).label;
/** Flags for a level; an unknown level behaves like Beginner. */
export const levelFlags = (level) => (LEVELS[level] || LEVELS.beginner).flags;

/** The level chosen for a set (kept on this device); Beginner until the learner picks another. */
export function resolveLevel(settings, sessionId) {
  const saved = settings?.practiceLevels?.[sessionId];
  return isLevel(saved) ? saved : "beginner";
}

export function nextLevel(level) {
  const i = LEVEL_IDS.indexOf(level);
  return LEVEL_IDS[Math.min(LEVEL_IDS.length - 1, Math.max(0, i) + 1)];
}

/**
 * The level to offer next, or null. Offered after two strong cases (0.8 or
 * better) in a row at the current level; never past Advanced. Only a suggestion:
 * the learner decides.
 * @param {number[]} scores 0..1, oldest first, for cases played at `level`
 */
export function suggestStepUp(scores, level) {
  if (level === "advanced" || !isLevel(level)) return null;
  const last = (scores || []).slice(-2);
  return last.length === 2 && last.every((s) => s >= 0.8) ? nextLevel(level) : null;
}
