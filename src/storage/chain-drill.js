// Chain drills (Medicine mode): which chain to drill, in what order, and how
// the round scores. Pure, so it's unit tested (tests/chain-drills.test.mjs).

import { chainCoverage, liveChains } from "./chains.js";
import { linkId } from "./chain-links.js";

export const EXERCISES = ["rebuild", "gap", "backwards"];
/** A chain needs at least this many filled steps to be worth drilling. */
export const MIN_STEPS = 2;

export function drillableChains(chains) {
  return liveChains(chains).filter((ch) => chainCoverage(ch).filled >= MIN_STEPS);
}

/** How many times each chain in this set has been drilled. */
export function drillCounts(reviewLog, sessionId) {
  const counts = new Map();
  for (const row of reviewLog || []) {
    if (row.kind !== "chain-drill" || row.sessionId !== sessionId || !row.chainId) continue;
    counts.set(row.chainId, (counts.get(row.chainId) || 0) + 1);
  }
  return counts;
}

/** The least-drilled chain, ties broken by title so the pick is predictable. */
export function pickDrillChain(chains, reviewLog, sessionId) {
  const usable = drillableChains(chains);
  if (!usable.length) return null;
  const counts = drillCounts(reviewLog, sessionId);
  return usable
    .slice()
    .sort((a, b) => (counts.get(a.id) || 0) - (counts.get(b.id) || 0) || String(a.title).localeCompare(String(b.title)))[0];
}

/** Indexes 0..n-1 in random order, never already in the right order for n > 1. */
export function shuffledOrder(n, rand = Math.random) {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (n > 1 && order.every((v, i) => v === i)) [order[0], order[1]] = [order[1], order[0]];
  return order;
}

/** Link-card ids for the steps the learner got wrong, so those links come back sooner. */
export function failedLinkIds(chain, steps) {
  const ids = [];
  for (let i = 1; i < steps.length; i++) {
    if (steps[i]?.failed) ids.push(linkId(chain.id, steps[i - 1].key, steps[i].key));
  }
  return ids;
}

/** Share of links the learner got right, 0..1, for the review-log grade. */
export function roundScore(steps) {
  const links = Math.max(0, steps.length - 1);
  if (!links) return 1;
  const failed = steps.filter((s, i) => i > 0 && s.failed).length;
  return (links - failed) / links;
}
