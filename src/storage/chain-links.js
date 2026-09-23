// Link cards: one review card per arrow in a mechanism chain (Medicine mode).
// Understanding lives in the links, so they go through the normal scheduler
// with everything else. Pure, so it's unit tested (tests/chain-links.test.mjs).
//
// Ids are derived from the chain and the two steps, so regenerating a chain
// keeps a link's review history instead of starting it over.

import { liveChains, orderedSteps, stepLabel } from "./chains.js";

export const LINK_PREFIX = "chainlink:";
/** New link cards let into review per day, so one chain can't swamp a session. */
export const MAX_NEW_LINKS_PER_DAY = 3;
const DAY_MS = 86_400_000;

export function isLinkCard(card) {
  return String(card?.id || "").startsWith(LINK_PREFIX);
}

export function linkId(chainId, fromKey, toKey) {
  return `${LINK_PREFIX}${chainId}:${fromKey}:${toKey}`;
}

/**
 * The link cards a set's chains currently justify. A link exists only between
 * two consecutive filled steps: a gap ends the run, so nothing is invented.
 */
export function buildLinkCards(set) {
  const out = [];
  const title = String(set?.title || "").trim();
  for (const chain of liveChains(set?.chains)) {
    const filled = orderedSteps(chain).filter((r) => r.step && r.step.statement);
    for (let i = 1; i < filled.length; i++) {
      const prev = filled[i - 1];
      const here = filled[i];
      // Consecutive in the template, or the gap between them breaks the link.
      const template = orderedSteps(chain).map((r) => r.key);
      if (template.indexOf(here.key) !== template.indexOf(prev.key) + 1) continue;
      const context = [title, chain.title, `${stepLabel(chain.template, prev.key)} → ${stepLabel(chain.template, here.key)}`]
        .filter(Boolean)
        .join(" · ");
      const why = String(here.step.why || "").trim();
      out.push({
        id: linkId(chain.id, prev.key, here.key),
        // With a "why" from the source, ask for it; otherwise ask for the next step.
        front: why
          ? `${context}\n\nWhy does “${prev.step.statement}” lead to “${here.step.statement}”?`
          : `${context}\n\n${prev.step.statement} → ?`,
        back: why || here.step.statement,
      });
    }
  }
  return out;
}

/** A rewritten link is a new fact to learn; a tidy-up of the wording isn't. */
export function isSubstantialChange(card, next) {
  if (card.back !== next.back) return true;
  const a = String(card.front || "");
  const b = String(next.front || "");
  return Math.abs(a.length - b.length) > 10;
}

/**
 * Bring a set's link cards in step with its chains: add new ones, update
 * changed ones, retire (tombstone) links whose steps are gone. Returns the new
 * flashcards array; never touches ordinary cards.
 */
export function syncLinkCards(set, { now = Date.now(), nowISO = () => new Date().toISOString() } = {}) {
  const cards = (set.flashcards || []).map((c) => ({ ...c }));
  if (set.mode !== "medicine") return cards;

  const wanted = new Map(buildLinkCards(set).map((l) => [l.id, l]));

  for (const card of cards) {
    if (isLinkCard(card) && !card.deleted && !wanted.has(card.id)) {
      card.deleted = true;
      card.updatedAt = nowISO();
    }
  }

  // Spread new cards over days so a long chain doesn't arrive all at once.
  const slots = newCardSlots(cards, now);
  const stamp = nowISO();

  for (const [id, link] of wanted) {
    const existing = cards.find((c) => c.id === id);
    if (!existing) {
      cards.push({ id, front: link.front, back: link.back, dueDate: slots.next(), updatedAt: stamp, repetitions: 0, interval: 0, easiness: 2.5 });
      continue;
    }
    const revived = existing.deleted;
    const changed = existing.front !== link.front || existing.back !== link.back;
    if (!changed && !revived) continue;
    const reset = revived || isSubstantialChange(existing, link);
    existing.front = link.front;
    existing.back = link.back;
    existing.deleted = false;
    existing.updatedAt = stamp;
    if (reset) {
      // Learn it again from scratch: drop the schedule and queue it like a new card.
      for (const f of ["stability", "difficulty", "state", "lastReview", "lapses"]) delete existing[f];
      existing.easiness = 2.5;
      existing.interval = 0;
      existing.repetitions = 0;
      existing.dueDate = slots.next();
    }
  }
  return cards;
}

/** Hands out due dates: MAX_NEW_LINKS_PER_DAY per day, starting today. */
function newCardSlots(cards, now) {
  const today = Math.floor(now / DAY_MS);
  const perDay = new Map();
  for (const c of cards) {
    if (!isLinkCard(c) || c.deleted || (c.repetitions ?? 0) > 0) continue;
    const day = Math.max(today, Math.floor((Number(c.dueDate) || now) / DAY_MS));
    perDay.set(day, (perDay.get(day) || 0) + 1);
  }
  return {
    next() {
      let day = today;
      while ((perDay.get(day) || 0) >= MAX_NEW_LINKS_PER_DAY) day++;
      perDay.set(day, (perDay.get(day) || 0) + 1);
      // Today's slots are due now; later days at the same time of day.
      return day === today ? now : day * DAY_MS;
    },
  };
}
