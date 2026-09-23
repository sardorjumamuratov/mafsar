// Comparing two mechanism chains (Medicine mode): which steps are the same and
// which are the fork. Pure, so it's unit tested (tests/compare.test.mjs).
//
// "Same" is a guess from word overlap. The learner can overrule it per step and
// their call is stored on the set, so it survives a regenerated chain.

import { templateSteps } from "./chains.js";

export const FORK_PREFIX = "fork:";
/** Word overlap at or above this counts as the same step until told otherwise. */
export const SAME_THRESHOLD = 0.5;

export function tokenize(str) {
  return String(str).toLowerCase().match(/\w+/g) || [];
}

/** Jaccard-ish overlap of the two statements' words, 0..1. */
export function similarity(a, b) {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));
  if (!setA.size && !setB.size) return 1;
  if (!setA.size || !setB.size) return 0;
  let intersect = 0;
  for (const w of setA) if (setB.has(w)) intersect++;
  return intersect / Math.max(setA.size, setB.size);
}

/** The override key for a pair of chains, in a fixed order so it's symmetric. */
export function overrideKey(id1, id2, key) {
  return [String(id1), String(id2)].sort().join("|") + "|" + key;
}

const liveStep = (chain, key) => (chain?.steps || []).find((s) => s.key === key && !s.deleted);

export function isSame(chain1, chain2, key, set) {
  const override = (set?.chainOverrides || {})[overrideKey(chain1.id, chain2.id, key)];
  if (override) return override === "same";
  const s1 = liveStep(chain1, key);
  const s2 = liveStep(chain2, key);
  if (!s1 || !s2) return false; // a gap on one side isn't sameness, it's unknown
  return similarity(s1.statement, s2.statement) >= SAME_THRESHOLD;
}

/** Every pair of chains, the ones sharing most steps first. */
export function suggestPairs(chains, set) {
  const pairs = [];
  for (let i = 0; i < chains.length; i++) {
    for (let j = i + 1; j < chains.length; j++) {
      const keys = templateSteps(chains[i].template);
      let shared = 0;
      for (const { key } of keys) if (isSame(chains[i], chains[j], key, set)) shared++;
      pairs.push({ c1: chains[i], c2: chains[j], shared });
    }
  }
  return pairs.sort((a, b) => b.shared - a.shared);
}

export function forkId(id1, id2, key) {
  return FORK_PREFIX + [String(id1), String(id2)].sort().join(":") + ":" + key;
}

/**
 * Add one card per divergence to the set's flashcards, and return how many are
 * new. Only steps filled in *both* chains can fork: a gap is not a difference.
 * Cards get a fresh schedule like any other new card, so they review and sync
 * with the rest.
 */
export function buildForkCards(c1, c2, set, keys, { now = Date.now(), nowISO = () => new Date().toISOString() } = {}) {
  const cards = (set.flashcards = set.flashcards || []);
  const stamp = nowISO();
  let added = 0;

  for (const { key, label } of keys) {
    const s1 = liveStep(c1, key);
    const s2 = liveStep(c2, key);
    if (!s1 || !s2) continue;
    if (isSame(c1, c2, key, set)) continue;

    const id = forkId(c1.id, c2.id, key);
    const front = `What separates ${c1.title} from ${c2.title} on ${label}?`;
    const back = `${c1.title}: ${s1.statement}\n${c2.title}: ${s2.statement}`;
    const existing = cards.find((c) => c.id === id);
    if (existing && !existing.deleted) {
      // Keep the schedule; the statements may have been edited since.
      if (existing.front !== front || existing.back !== back) {
        existing.front = front;
        existing.back = back;
        existing.updatedAt = stamp;
      }
      continue;
    }
    if (existing) {
      // Was deleted: bring it back as a new card rather than pushing a duplicate.
      Object.assign(existing, { front, back, deleted: false, updatedAt: stamp, dueDate: now, repetitions: 0, interval: 0, easiness: 2.5 });
      for (const f of ["stability", "difficulty", "state", "lastReview", "lapses"]) delete existing[f];
    } else {
      cards.push({ id, front, back, dueDate: now, updatedAt: stamp, repetitions: 0, interval: 0, easiness: 2.5 });
    }
    added++;
  }
  return added;
}
