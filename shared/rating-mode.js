/**
 * What a set's page offers for ratings. Ratings are for global sets, by
 * someone who didn't make them: rating your own set tells you nothing, and your
 * own vote only inflates the average everyone else sees.
 *
 *   "rate"    a copy from Discover whose original is still global: stars
 *   "summary" a set you made and published: its average, read-only
 *   "none"    anything else (a private set of yours, an unpublished original)
 *
 * @param {{ originSetId?: string | null, isGlobal?: boolean }} set
 *   `originSetId` is set on a copy; `isGlobal` is whether the ORIGINAL is
 *   published (for a set you made, that's the set itself).
 * @returns {"rate" | "summary" | "none"}
 */
export function ratingMode({ originSetId, isGlobal }) {
  if (!isGlobal) return "none";
  return originSetId ? "rate" : "summary";
}
