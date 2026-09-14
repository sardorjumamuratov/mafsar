import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runSync } from '../index';
import * as db from '../../db';
import * as auth from '../../auth';

vi.mock('../../db');
vi.mock('../../auth');

describe('Sync Engine', () => {
  let mockDB: any;
  let meta: Record<string, string>;
  
  beforeEach(() => {
    vi.resetAllMocks();
    meta = { lastSync: '2026-01-01T00:00:00Z' };
    
    mockDB = {
      getAllAsync: vi.fn().mockResolvedValue([]),
      getFirstAsync: vi.fn().mockResolvedValue(null),
      runAsync: vi.fn().mockResolvedValue(undefined),
      withTransactionAsync: vi.fn(async (cb: any) => await cb())
    };
    
    vi.mocked(db.getDB).mockResolvedValue(mockDB as any);
    vi.mocked(db.getMeta).mockImplementation(async (key) => meta[key] || null);
    vi.mocked(db.setMeta).mockImplementation(async (key, val) => { meta[key] = val; });
    
    vi.mocked(auth.authedFetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        serverTime: '2026-01-02T00:00:00Z',
        sets: [],
        cards: [],
        quiz: [],
        activity: [],
        reviews: []
      })
    } as any);
  });

  it('pushes dirty rows and applies empty response', async () => {
    mockDB.getAllAsync.mockImplementation(async (query: string) => {
      if (query.includes('sets')) return [{ id: 's1', title: 'S1', updated_at: 'T1', dirty: 1 }];
      return [];
    });
    
    await runSync();
    
    expect(auth.authedFetch).toHaveBeenCalledWith('/v1/sync', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"id":"s1"')
    }));
    
    // Should clear dirty flag
    expect(mockDB.runAsync).toHaveBeenCalledWith(
      'UPDATE sets SET dirty = 0 WHERE id = ? AND updated_at = ?',
      ['s1', 'T1']
    );
    expect(meta.lastSync).toBe('2026-01-02T00:00:00Z');
  });

  it('applies pulled cards (LWW)', async () => {
    vi.mocked(auth.authedFetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        serverTime: '2026-01-02T00:00:00Z',
        sets: [],
        cards: [{ id: 'c1', setId: 's1', updatedAt: 'T2' }],
        quiz: [],
        activity: [],
        reviews: []
      })
    } as any);
    
    // Existing card is older
    mockDB.getFirstAsync.mockImplementation(async () => ({ updated_at: 'T1' }));
    
    await runSync();
    
    expect(mockDB.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR REPLACE INTO cards'),
      expect.arrayContaining(['c1', 's1', 'T2'])
    );
  });

  it('ignores stale pulled cards', async () => {
    vi.mocked(auth.authedFetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        serverTime: '2026-01-02T00:00:00Z',
        sets: [],
        cards: [{ id: 'c1', setId: 's1', updatedAt: 'T1' }], // Stale
        quiz: [],
        activity: [],
        reviews: []
      })
    } as any);
    
    // Existing card is newer
    mockDB.getFirstAsync.mockImplementation(async () => ({ updated_at: 'T2' }));
    
    await runSync();
    
    expect(mockDB.runAsync).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR REPLACE INTO cards'),
      expect.anything()
    );
  });
});
