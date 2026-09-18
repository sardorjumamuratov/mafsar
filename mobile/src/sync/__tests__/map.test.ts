import { describe, it, expect } from 'vitest';
import { cardFromWire, cardToWire, isNewer, setFromWire, setToWire, toIso, toMs } from '../map';

const T = '2026-09-01T10:00:00.000Z';

describe('time conversion', () => {
  it('reads epoch ms, numeric strings and ISO', () => {
    const ms = Date.parse(T);
    expect(toMs(ms)).toBe(ms);
    expect(toMs(String(ms))).toBe(ms);
    expect(toMs(T)).toBe(ms);
  });

  it('treats missing or garbage values as null', () => {
    expect(toMs(null)).toBeNull();
    expect(toMs(undefined)).toBeNull();
    expect(toMs('')).toBeNull();
    expect(toMs('not a date')).toBeNull();
    expect(toIso(null)).toBeNull();
  });
});

describe('cards', () => {
  const row = {
    id: 'c1', set_id: 's1', front: 'Q', back: 'A', easiness: 2.4, interval: 6, repetitions: 3,
    due_date: Date.parse(T), updated_at: T, deleted: 0,
    stability: 7.5, difficulty: 5.1, state: 'review', lapses: 1, last_review: Date.parse(T) - 86_400_000,
  };

  it('pushes FSRS state with ISO times', () => {
    const wire = cardToWire(row);
    expect(wire).toMatchObject({ id: 'c1', setId: 's1', stability: 7.5, difficulty: 5.1, state: 'review', lapses: 1 });
    expect(wire.dueDate).toBe(T);
    expect(wire.lastReview).toBe(new Date(row.last_review).toISOString());
  });

  it('pulls server rows back to epoch ms, in column order', () => {
    const cols = cardFromWire({ ...cardToWire(row) });
    expect(cols[0]).toBe('c1');
    expect(cols[7]).toBe(row.due_date);
    expect(cols[14]).toBe(row.last_review);
  });

  it('turns the server null lapses into 0 (the column is NOT NULL)', () => {
    const cols = cardFromWire({ id: 'c2', setId: 's1', updatedAt: T, lapses: null, stability: null, lastReview: null });
    expect(cols[13]).toBe(0);
    expect(cols[10]).toBeNull();
    expect(cols[14]).toBeNull();
  });
});

describe('sets', () => {
  it('round-trips the exam date', () => {
    const exam = Date.parse('2026-12-01T09:00:00.000Z');
    const wire = setToWire({ id: 's1', title: 'Torts', exam_date: exam, created_at: T, updated_at: T, deleted: 0 });
    expect(wire.examDate).toBe('2026-12-01T09:00:00.000Z');
    expect(setFromWire(wire)[5]).toBe(exam);
  });
});

describe('last write wins', () => {
  it('takes a server row only when strictly newer', () => {
    expect(isNewer('2026-09-02T00:00:00.000Z', T)).toBe(true);
    expect(isNewer(T, T)).toBe(false);
    expect(isNewer('2026-08-01T00:00:00.000Z', T)).toBe(false);
    expect(isNewer(T, undefined)).toBe(true);
  });
});
