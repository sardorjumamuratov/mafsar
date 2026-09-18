import { getDB, getMeta, setMeta } from '../db';
import { authedFetch, isSignedIn } from '../auth';
import { cardFromWire, cardToWire, isNewer, reviewToWire, setFromWire, setToWire } from './map';

// Offline-first sync with the same /v1/sync endpoint the extension uses: push
// rows marked dirty, pull everything the server stored since `lastSync`.

let inFlight: Promise<SyncResult> | null = null;

export interface SyncResult { pushed: number; pulled: number; }

/** Runs one sync; concurrent callers share the same round trip. */
export function runSync(): Promise<SyncResult> {
  if (!inFlight) {
    inFlight = doSync().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

/** Sync if signed in, swallowing errors (offline is normal on a phone). */
export async function syncQuietly(): Promise<void> {
  try {
    if (await isSignedIn()) await runSync();
  } catch {
    /* next foreground or pull-to-refresh retries */
  }
}

async function doSync(): Promise<SyncResult> {
  const db = await getDB();
  const lastSync = (await getMeta('lastSync')) || '';

  const dirtySets = await db.getAllAsync<any>('SELECT * FROM sets WHERE dirty = 1');
  const dirtyCards = await db.getAllAsync<any>('SELECT * FROM cards WHERE dirty = 1');
  const dirtyReviews = await db.getAllAsync<any>('SELECT * FROM review_log WHERE dirty = 1');
  // The server max-merges activity per day, so pushing all of it is idempotent.
  const allActivity = await db.getAllAsync<any>('SELECT day, count FROM activity');

  const body = {
    since: lastSync || undefined,
    sets: dirtySets.map(setToWire),
    cards: dirtyCards.map(cardToWire),
    quiz: [],
    activity: allActivity.map((a) => ({ day: a.day, count: a.count })),
    reviews: dirtyReviews.map(reviewToWire),
  };

  const res = await authedFetch('/v1/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Sync failed (${res.status})`);
  const data = await res.json();
  let pulled = 0;

  await db.withTransactionAsync(async () => {
    // Clear dirty only for rows unchanged since we read them: a review made
    // while the request was in flight has a newer updated_at and stays dirty.
    for (const s of dirtySets) {
      await db.runAsync('UPDATE sets SET dirty = 0 WHERE id = ? AND updated_at = ?', [s.id, s.updated_at]);
    }
    for (const c of dirtyCards) {
      await db.runAsync('UPDATE cards SET dirty = 0 WHERE id = ? AND updated_at = ?', [c.id, c.updated_at]);
    }
    for (const r of dirtyReviews) {
      await db.runAsync('UPDATE review_log SET dirty = 0 WHERE id = ?', [r.id]);
    }

    for (const s of data.sets || []) {
      const stored = await db.getFirstAsync<any>('SELECT updated_at FROM sets WHERE id = ?', [s.id]);
      if (!isNewer(s.updatedAt, stored?.updated_at)) continue;
      await db.runAsync(
        `INSERT OR REPLACE INTO sets (id, title, source, source_label, mode, exam_date, created_at, updated_at, deleted, dirty)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        setFromWire(s)
      );
      pulled++;
    }

    for (const c of data.cards || []) {
      await db.runAsync(
        `INSERT OR IGNORE INTO sets (id, title, created_at, updated_at, deleted, dirty) VALUES (?, '(pending set)', ?, ?, 0, 0)`,
        [c.setId, c.updatedAt, c.updatedAt]
      );
      const stored = await db.getFirstAsync<any>('SELECT updated_at FROM cards WHERE id = ?', [c.id]);
      if (!isNewer(c.updatedAt, stored?.updated_at)) continue;
      await db.runAsync(
        `INSERT OR REPLACE INTO cards (id, set_id, front, back, easiness, interval, repetitions, due_date, updated_at, deleted, stability, difficulty, state, lapses, last_review, dirty)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        cardFromWire(c)
      );
      pulled++;
    }

    for (const q of data.quiz || []) {
      await db.runAsync(
        `INSERT OR IGNORE INTO sets (id, title, created_at, updated_at, deleted, dirty) VALUES (?, '(pending set)', ?, ?, 0, 0)`,
        [q.setId, q.updatedAt, q.updatedAt]
      );
      const stored = await db.getFirstAsync<any>('SELECT updated_at FROM quiz WHERE id = ?', [q.id]);
      if (!isNewer(q.updatedAt, stored?.updated_at)) continue;
      await db.runAsync(
        `INSERT OR REPLACE INTO quiz (id, set_id, question, options_json, answer, explain, updated_at, deleted, dirty)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [q.id, q.setId, q.q, JSON.stringify(q.options || []), q.answer ?? 0, q.explain ?? null, q.updatedAt, q.deleted ? 1 : 0]
      );
      pulled++;
    }

    for (const a of data.activity || []) {
      await db.runAsync(
        `INSERT INTO activity (day, count, dirty) VALUES (?, ?, 0)
         ON CONFLICT(day) DO UPDATE SET count = MAX(count, excluded.count), dirty = 0`,
        [a.day, a.count]
      );
    }

    for (const r of data.reviews || []) {
      await db.runAsync(
        `INSERT OR IGNORE INTO review_log (id, card_id, grade, prev_interval, new_interval, reviewed_at, kind, stability, difficulty, dirty)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [r.id, r.cardId, r.grade, r.prevInterval ?? 0, r.newInterval ?? 0, r.reviewedAt, r.kind ?? 'flashcard', r.stability ?? null, r.difficulty ?? null]
      );
    }
  });

  await setMeta('lastSync', data.serverTime);
  await setMeta('lastSyncAt', new Date().toISOString());
  return { pushed: dirtySets.length + dirtyCards.length + dirtyReviews.length, pulled };
}
