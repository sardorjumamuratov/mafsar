// Design drill: pure rules for the answer template and scoring, unit tested in
// tests/design.test.mjs.

/** Matches MAX_DESIGN_ANSWER on the server (server/src/schema.ts). */
export const MAX_DESIGN_CHARS = 4000;
/** Curveballs per drill before the summary. */
export const MAX_CURVEBALLS = 2;

export const SECTIONS = [
  { key: "requirements", title: "Requirements", hint: "What must it do? Scale, latency, consistency?" },
  { key: "estimates", title: "Estimates", hint: "Traffic, storage, bandwidth: rough numbers." },
  { key: "api", title: "API", hint: "The main endpoints or calls." },
  { key: "dataModel", title: "Data model", hint: "Key entities and where they live." },
  { key: "components", title: "Components & flow", hint: "The parts and how a request moves through them." },
  { key: "bottlenecks", title: "Bottlenecks & trade-offs", hint: "What breaks first, and what you chose not to do." },
];

export function emptySections() {
  return Object.fromEntries(SECTIONS.map((s) => [s.key, ""]));
}

/**
 * The answer sent for grading: filled sections under their titles. Never
 * truncated here; the caller checks the length and tells the learner.
 */
export function assembleAnswer(sections) {
  return SECTIONS
    .map(({ key, title }) => [title, String((sections || {})[key] || "").trim()])
    .filter(([, text]) => text)
    .map(([title, text]) => `${title}:\n${text}`)
    .join("\n\n");
}

export function answerTooLong(answer) {
  return String(answer || "").length > MAX_DESIGN_CHARS;
}

/** Share of rubric points covered (partial counts half), 0..1. */
export function rubricScore(rubricEvaluation) {
  const rows = Array.isArray(rubricEvaluation) ? rubricEvaluation : [];
  if (!rows.length) return 0;
  const points = rows.reduce((n, r) => n + (r.status === "covered" ? 1 : r.status === "partial" ? 0.5 : 0), 0);
  return points / rows.length;
}

/** Overall drill result: the first answer counts double, each curveball once. */
export function drillScore(grading, curveballGradings = []) {
  const parts = [rubricScore(grading?.rubric_evaluation), rubricScore(grading?.rubric_evaluation)];
  for (const g of curveballGradings) if (g) parts.push(rubricScore(g.rubric_evaluation));
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}
