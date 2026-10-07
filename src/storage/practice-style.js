// Practice styles for the system design modes (docs/prompts/38). Pure, so it's
// unit tested in tests/practice-style.test.mjs; the sheets that choose a style
// live in src/ui/practice-ui.js.
//
// Flows read behaviour flags from here instead of comparing style names, so a
// later style (an "adaptive" one that eases guidance off as the learner
// improves) is one new entry, not a hunt through every flow.

export const STYLES = { GUIDED: "guided", SIMULATION: "simulation" };

export const PRACTICE_STYLES = {
  guided: {
    label: "Learn concepts",
    short: "Guided",
    description: "Get guidance, optional hints, and feedback as you go.",
    icon: "compass",
    flags: {
      stepByStep: true, // Design brief: four short steps instead of six sections
      checkpoints: true, // "Check my thinking" on each step
      conceptChips: true,
      structuredBottleneck: true, // What breaks: three fields instead of one
      progressiveHints: 3, // hints available per exercise
      hintPenalty: 0,
      workingOpen: true, // Estimation: rough working shown by default
      scaffolds: true, // Estimation: nudge, scaffold, Average/Peak
      timer: false,
    },
  },
  simulation: {
    label: "Interview simulation",
    short: "Simulation",
    description: "Practice under realistic conditions and review feedback at the end.",
    icon: "stopwatch",
    flags: {
      stepByStep: false,
      checkpoints: false,
      conceptChips: false,
      structuredBottleneck: false,
      progressiveHints: 1,
      hintPenalty: 0.5,
      workingOpen: false,
      scaffolds: false,
      timer: true,
    },
  },
};

export const STYLE_IDS = Object.keys(PRACTICE_STYLES);
export const isStyle = (v) => STYLE_IDS.includes(v);

/** The style for a session: a per-session override, else the saved default, else null (ask). */
export function resolveStyle(settings, override) {
  if (isStyle(override)) return override;
  const saved = settings?.systemDesignPracticeStyle;
  return isStyle(saved) ? saved : null;
}

/** Behaviour flags for a style; an unknown style behaves like today's Interview simulation. */
export function styleFlags(style) {
  return (PRACTICE_STYLES[style] || PRACTICE_STYLES.simulation).flags;
}

export const styleLabel = (style) => PRACTICE_STYLES[style]?.label || "Not set";
export const styleShort = (style) => PRACTICE_STYLES[style]?.short || "Choose";
