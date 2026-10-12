// Multiple-choice options and hints for the chain drill (docs/prompts/39). Pure
// and deterministic for a seed, so it's unit tested in tests/practice-level.test.mjs.
// No model call: the wrong answers come from the learner's own chains.

/** mulberry32: a tiny seeded generator, so a drill's options can be reproduced in a test. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle(list, seed) {
  const out = [...list];
  const rand = rng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const textOf = (s) => String(s?.step?.statement || "").trim();

/**
 * Four options for a step: the right statement and three wrong ones. Wrong ones
 * come from the same kind of step in other chains first, then from other steps
 * of this chain. Returns null when there aren't two distinct wrong answers.
 * @param {{ target: object, chain: { id?: string, steps: object[] }, otherChains: { steps: object[] }[], seed: number }} args
 */
export function pickChainOptions({ target, chain, otherChains, seed }) {
  const correct = textOf(target);
  if (!correct) return null;
  const seen = new Set([correct.toLowerCase()]);
  const wrong = [];
  const take = (statement) => {
    const t = String(statement || "").trim();
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      wrong.push(t);
    }
  };
  const sameKind = (otherChains || []).flatMap((c) => (c.steps || []).filter((s) => s.key === target.key));
  const sameKindOrder = seededShuffle(sameKind, seed + 1);
  sameKindOrder.forEach((s) => take(textOf(s)));
  if (wrong.length < 3) seededShuffle((chain.steps || []).filter((s) => s !== target), seed + 2).forEach((s) => take(textOf(s)));
  if (wrong.length < 3) seededShuffle((otherChains || []).flatMap((c) => c.steps || []), seed + 3).forEach((s) => take(textOf(s)));
  if (wrong.length < 2) return null;
  const options = seededShuffle([correct, ...wrong.slice(0, 3)], seed).map((text, i) => ({ id: `o${i + 1}`, text }));
  return { options, correctId: options.find((o) => o.text === correct).id };
}

/** The steps nearest the given end of a chain, in order: a shorter chain for an easier level. */
export function trimChain(steps, length) {
  return Number.isFinite(length) && steps.length > length ? steps.slice(steps.length - length) : steps;
}

/**
 * Three hints for step `idx`: what kind of step it is, then the link's own
 * "why" (or its neighbours), then how the statement begins. Never the statement.
 */
export function chainHints(steps, idx) {
  const s = steps[idx];
  const label = String(s?.label || s?.key || "step");
  const why = String(s?.step?.why || "").trim();
  // Statements end in full stops; trim them so a hint doesn't read “…needed.”.
  const bare = (x) => x.replace(/[\s.,;:!?]+$/, "");
  const near = [steps[idx - 1], steps[idx + 1]].map(textOf).filter(Boolean).map(bare);
  const first = bare(textOf(s).split(/\s+/).slice(0, 2).join(" "));
  return [
    `This is the "${label}" step.`,
    why || (near.length ? `It sits between: ${near.map((n) => `“${n}”`).join(" and ")}.` : `Think about what leads into the next step.`),
    first ? `It starts: “${first}…”` : "Say it in your own words, in one line.",
  ];
}
