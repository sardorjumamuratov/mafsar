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
 * Session metadata kept on the row (docs/prompts/38 §12). These fields stay on
 * this device: the server's reviewSchema keeps only the core review fields and
 * drops the rest without failing the batch. Never put answer text here.
 */
export function drillMeta(meta = {}) {
  const out = {};
  const str = (v, max = 60) => (typeof v === "string" && v ? v.slice(0, max) : undefined);
  const num = (v) => (Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined);
  const fields = {
    practiceStyle: str(meta.practiceStyle, 20),
    level: str(meta.level, 20),
    score: Number.isFinite(meta.score) && meta.score >= 0 && meta.score <= 1 ? Math.round(meta.score * 100) / 100 : undefined,
    mode: str(meta.mode, 20),
    startedAt: str(meta.startedAt, 40),
    completedAt: str(meta.completedAt, 40),
    durationMs: num(meta.durationMs),
    usedHint: typeof meta.usedHint === "boolean" ? meta.usedHint : undefined,
    hintCount: num(meta.hintCount),
    selectedComponentId: str(meta.selectedComponentId, 60),
    savedSuggestedCardIds: Array.isArray(meta.savedSuggestedCardIds) ? meta.savedSuggestedCardIds.filter((x) => typeof x === "string").slice(0, 3) : undefined,
  };
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) out[k] = v;
  return out;
}

/**
 * @param {{ kind: string, sessionId: string, fraction: number, id: string, chainId?: string, reviewedAt?: string, meta?: object }} row
 */
export function drillLogEntry({ kind, sessionId, fraction, id, chainId = "", reviewedAt = new Date().toISOString(), meta }) {
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
    ...drillMeta(meta),
  };
}
