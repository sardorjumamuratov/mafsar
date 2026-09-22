// Teach-it-back rules that don't need the DOM or chrome.*, so they're unit tested.

export const MAX_TEACH_CARDS = 6;
export const STUCK_TEXT = "I'm stuck. Can you give me a hint?";
const RANK = { not_yet: 0, partial: 1, covered: 2 };

/** Up to six ideas to teach: due cards first, then the rest, in set order within each group. */
export function selectTeachCards(cards, isDue = (c) => false) {
  const usable = (cards || []).filter((c) => c && c.id && c.front && c.back);
  const due = usable.filter((c) => isDue(c));
  const rest = usable.filter((c) => !isDue(c));
  return [...due, ...rest]
    .slice(0, MAX_TEACH_CARDS)
    .map((c) => ({ id: String(c.id), front: String(c.front).slice(0, 500), back: String(c.back).slice(0, 2000) }));
}

/** Coverage only moves forward: a later "partial" never undoes an earlier "covered". */
export function mergeCoverage(prev = {}, next = {}) {
  const out = { ...prev };
  for (const [id, value] of Object.entries(next || {})) {
    if (typeof value !== "string" || !Object.hasOwn(RANK, value)) continue;
    if (!Object.hasOwn(out, id) || RANK[value] > RANK[out[id]]) out[id] = value;
  }
  return out;
}

export function coverageCount(coverage, cards) {
  return { covered: cards.filter((c) => coverage?.[c.id] === "covered").length, total: cards.length };
}

export function canFinish(messages) {
  return (messages || []).filter((m) => m.role === "learner").length >= 2;
}

/** Review-log grade for an evaluated idea; null = not attempted, so don't log it. */
export function reviewGradeFor(status) {
  return { taught: 4, taught_with_hints: 3, incorrect: 1 }[status] ?? null;
}


export const PERSONAS = {
  child:    { emoji: "👶", short: "12-year-old", long: "a curious 12-year-old", option: "A curious 12-year-old" },
  beginner: { emoji: "🐣", short: "beginner",    long: "a complete beginner",   option: "A complete beginner" },
};

/** Unknown values fall back to child, matching setTeachPersona. */
export function personaInfo(id) {
  if (id === "beginner") return PERSONAS.beginner;
  return PERSONAS.child;
}
