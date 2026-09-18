// Pure row <-> wire conversion for /v1/sync. No React Native imports, so it's
// unit-tested under plain node (src/sync/__tests__/map.test.ts).
//
// Local SQLite keeps times as epoch ms; the server speaks ISO strings. The
// server returns null for FSRS fields a card has never had.

export interface CardRowDB {
  id: string; set_id: string; front: string; back: string;
  easiness: number; interval: number; repetitions: number;
  due_date: number | string | null; updated_at: string; deleted: number;
  stability: number | null; difficulty: number | null; state: string | null;
  lapses: number | null; last_review: number | string | null;
}

/** Epoch ms from ms, a numeric string, or ISO. null when absent or invalid. */
export function toMs(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(v);
  if (!Number.isNaN(n)) return n;
  const t = Date.parse(String(v));
  return Number.isNaN(t) ? null : t;
}

export function toIso(v: unknown): string | null {
  const ms = toMs(v);
  return ms == null ? null : new Date(ms).toISOString();
}

export function setToWire(s: any) {
  return {
    id: s.id,
    title: s.title,
    source: s.source ?? null,
    sourceLabel: s.source_label ?? null,
    mode: s.mode ?? 'general',
    examDate: toIso(s.exam_date),
    createdAt: s.created_at,
    updatedAt: s.updated_at,
    deleted: !!s.deleted,
  };
}

export function cardToWire(c: CardRowDB) {
  return {
    id: c.id,
    setId: c.set_id,
    front: c.front,
    back: c.back,
    easiness: c.easiness ?? 2.5,
    interval: c.interval ?? 0,
    repetitions: c.repetitions ?? 0,
    dueDate: toIso(c.due_date),
    updatedAt: c.updated_at,
    deleted: !!c.deleted,
    stability: c.stability ?? null,
    difficulty: c.difficulty ?? null,
    state: c.state ?? null,
    lapses: c.lapses ?? 0,
    lastReview: toIso(c.last_review),
  };
}

export function reviewToWire(r: any) {
  return {
    id: r.id,
    cardId: r.card_id,
    grade: r.grade,
    prevInterval: r.prev_interval ?? 0,
    newInterval: r.new_interval ?? 0,
    reviewedAt: r.reviewed_at,
    kind: r.kind ?? 'flashcard',
    stability: r.stability ?? null,
    difficulty: r.difficulty ?? null,
  };
}

/** A value SQLite can bind. */
export type Bind = string | number | null;

/** Column values, in INSERT order, for a card pulled from the server. */
export function cardFromWire(c: any): Bind[] {
  return [
    c.id, c.setId, c.front ?? '', c.back ?? '',
    c.easiness ?? 2.5, c.interval ?? 0, c.repetitions ?? 0,
    toMs(c.dueDate), c.updatedAt, c.deleted ? 1 : 0,
    c.stability ?? null, c.difficulty ?? null, c.state ?? null,
    c.lapses ?? 0, // NOT NULL column: the server sends null for old cards
    toMs(c.lastReview),
  ];
}

export function setFromWire(s: any): Bind[] {
  return [
    s.id, s.title ?? 'Untitled', s.source ?? null, s.sourceLabel ?? null, s.mode ?? null,
    toMs(s.examDate), s.createdAt ?? s.updatedAt, s.updatedAt, s.deleted ? 1 : 0,
  ];
}

/** Last-write-wins: take the server row only when it's strictly newer. */
export function isNewer(incoming: string | undefined, stored: string | undefined | null): boolean {
  if (!stored) return true;
  return (incoming || '') > stored;
}
