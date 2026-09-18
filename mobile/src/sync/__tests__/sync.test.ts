import { describe, it, expect, vi, beforeEach } from 'vitest';

// Factory mocks: the real modules import expo-sqlite / expo-secure-store,
// which pull in React Native and can't load under node.
vi.mock('../../db', () => ({ getDB: vi.fn(), getMeta: vi.fn(), setMeta: vi.fn() }));
vi.mock('../../auth', () => ({ authedFetch: vi.fn(), isSignedIn: vi.fn() }));

import { runSync } from '../index';
import * as db from '../../db';
import * as auth from '../../auth';

const T1 = '2026-01-01T00:00:00.000Z';
const T2 = '2026-01-02T00:00:00.000Z';

function response(body: object) {
  return { ok: true, status: 200, json: async () => ({ serverTime: T2, sets: [], cards: [], quiz: [], activity: [], reviews: [], ...body }) } as any;
}

describe('runSync', () => {
  let mockDB: any;
  let meta: Record<string, string>;

  beforeEach(() => {
    vi.resetAllMocks();
    meta = { lastSync: T1 };
    mockDB = {
      getAllAsync: vi.fn().mockResolvedValue([]),
      getFirstAsync: vi.fn().mockResolvedValue(null),
      runAsync: vi.fn().mockResolvedValue(undefined),
      withTransactionAsync: vi.fn(async (cb: () => Promise<void>) => cb()),
    };
    vi.mocked(db.getDB).mockResolvedValue(mockDB);
    vi.mocked(db.getMeta).mockImplementation(async (k) => meta[k] ?? null);
    vi.mocked(db.setMeta).mockImplementation(async (k, v) => {
      meta[k] = v;
    });
    vi.mocked(auth.authedFetch).mockResolvedValue(response({}));
  });

  it('pushes dirty cards with FSRS state and records the server time', async () => {
    mockDB.getAllAsync.mockImplementation(async (sql: string) =>
      sql.includes('FROM cards WHERE dirty')
        ? [{ id: 'c1', set_id: 's1', front: 'Q', back: 'A', updated_at: T1, due_date: Date.parse(T2), stability: 3.2, difficulty: 6, state: 'review', lapses: 0, last_review: Date.parse(T1) }]
        : []
    );
    await runSync();
    const body = JSON.parse(vi.mocked(auth.authedFetch).mock.calls[0][1]!.body as string);
    expect(body.since).toBe(T1);
    expect(body.cards[0]).toMatchObject({ id: 'c1', stability: 3.2, state: 'review', dueDate: T2, lastReview: T1 });
    expect(mockDB.runAsync).toHaveBeenCalledWith('UPDATE cards SET dirty = 0 WHERE id = ? AND updated_at = ?', ['c1', T1]);
    expect(meta.lastSync).toBe(T2);
  });

  it('applies a newer pulled card, converting times to epoch ms', async () => {
    vi.mocked(auth.authedFetch).mockResolvedValue(
      response({ cards: [{ id: 'c1', setId: 's1', front: 'Q', back: 'A', updatedAt: T2, dueDate: T2, lapses: null }] })
    );
    mockDB.getFirstAsync.mockResolvedValue({ updated_at: T1 });
    await runSync();
    const insert = mockDB.runAsync.mock.calls.find(([sql]: [string]) => sql.includes('INSERT OR REPLACE INTO cards'));
    expect(insert).toBeTruthy();
    expect(insert[1][7]).toBe(Date.parse(T2));
    expect(insert[1][13]).toBe(0);
  });

  it('ignores a pulled card older than the local copy', async () => {
    vi.mocked(auth.authedFetch).mockResolvedValue(response({ cards: [{ id: 'c1', setId: 's1', updatedAt: T1 }] }));
    mockDB.getFirstAsync.mockResolvedValue({ updated_at: T2 });
    await runSync();
    expect(mockDB.runAsync.mock.calls.some(([sql]: [string]) => sql.includes('INSERT OR REPLACE INTO cards'))).toBe(false);
  });

  it('shares one round trip between concurrent callers', async () => {
    await Promise.all([runSync(), runSync(), runSync()]);
    expect(auth.authedFetch).toHaveBeenCalledTimes(1);
  });

  it('keeps rows dirty and lastSync unchanged when the server fails', async () => {
    vi.mocked(auth.authedFetch).mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as any);
    await expect(runSync()).rejects.toThrow('Sync failed (500)');
    expect(meta.lastSync).toBe(T1);
    expect(mockDB.withTransactionAsync).not.toHaveBeenCalled();
  });
});
