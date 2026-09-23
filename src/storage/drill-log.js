// Review-log rows for practice drills that aren't about one card (Design drill,
// Estimation, Find the bottleneck). Pure, so it's unit tested.
//
// The server requires a non-empty cardId (server/src/schema.ts reviewSchema): an
// empty one fails validation for the WHOLE sync batch, and the row would be
// re-sent forever. Drills use a stable per-set id instead. It matches no card,
// so "Needs work" and scheduling ignore these rows.

export const DRILL_KINDS = ["design", "estimation", "bottleneck", "chain-drill", "clinical"];

export function drillCardId(sessionId) {
  return `set:${sessionId}`;
}

/** Map a 0..1 drill result onto the review scale (0 Again … 5 Easy). */
export function drillGrade(fraction) {
  const f = Math.max(0, Math.min(1, Number(fraction) || 0));
  return f >= 0.85 ? 5 : f >= 0.6 ? 4 : f >= 0.35 ? 3 : 1;
}

/**
 * @param {{ kind: string, sessionId: string, fraction: number, id: string, chainId?: string, reviewedAt?: string }} row
 */
export function drillLogEntry({ kind, sessionId, fraction, id, chainId = "", reviewedAt = new Date().toISOString() }) {
  if (!DRILL_KINDS.includes(kind)) throw new Error(`unknown drill kind: ${kind}`);
  if (!sessionId) throw new Error("drill log needs a sessionId");
  return {
    id,
    kind,
    cardId: drillCardId(sessionId),
    sessionId,
    grade: drillGrade(fraction),
    prevInterval: 0,
    newInterval: 0,
    reviewedAt,
    // Chain drills record which chain, so the picker can favour less-drilled ones.
    ...(chainId ? { chainId } : {}),
  };
}
