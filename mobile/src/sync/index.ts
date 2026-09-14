import { getDB, getMeta, setMeta } from '../db';
import { authedFetch } from '../auth';

let syncing = false;

export async function runSync() {
  if (syncing) return;
  syncing = true;
  try {
    const db = await getDB();
    const lastSync = (await getMeta('lastSync')) || '';

    // 1. Gather push payload
    const dirtySets = await db.getAllAsync<any>('SELECT * FROM sets WHERE dirty = 1');
    const dirtyCards = await db.getAllAsync<any>('SELECT * FROM cards WHERE dirty = 1');
    const dirtyQuiz = await db.getAllAsync<any>('SELECT * FROM quiz WHERE dirty = 1');
    const dirtyActivity = await db.getAllAsync<any>('SELECT * FROM activity WHERE dirty = 1');
    const dirtyReviews = await db.getAllAsync<any>('SELECT * FROM review_log WHERE dirty = 1');
    
    // We also push ALL activity (max-merge on server) because server doesn't track tombstones for activity
    const allActivity = await db.getAllAsync<any>('SELECT * FROM activity');

    const body = {
      since: lastSync,
      sets: dirtySets.map(s => ({
        id: s.id,
        title: s.title,
        source: s.source,
        sourceLabel: s.source_label,
        mode: s.mode,
        examDate: s.exam_date ? new Date(s.exam_date).toISOString() : null,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
        deleted: !!s.deleted
      })),
      cards: dirtyCards.map(c => ({
        id: c.id,
        setId: c.set_id,
        front: c.front,
        back: c.back,
        easiness: c.easiness,
        interval: c.interval,
        repetitions: c.repetitions,
        dueDate: c.due_date ? new Date(c.due_date).toISOString() : null,
        updatedAt: c.updated_at,
        deleted: !!c.deleted,
        stability: c.stability,
        difficulty: c.difficulty,
        state: c.state,
        lapses: c.lapses,
        lastReview: c.last_review
      })),
      quiz: dirtyQuiz.map(q => ({
        id: q.id,
        setId: q.set_id,
        q: q.question,
        options: JSON.parse(q.options_json),
        answer: q.answer,
        explain: q.explain,
        updatedAt: q.updated_at,
        deleted: !!q.deleted
      })),
      activity: allActivity.map(a => ({
        day: a.day,
        count: a.count
      })),
      reviews: dirtyReviews.map(r => ({
        id: r.id,
        cardId: r.card_id,
        grade: r.grade,
        prevInterval: r.prev_interval,
        newInterval: r.new_interval,
        reviewedAt: r.reviewed_at,
        kind: r.kind,
        stability: r.stability,
        difficulty: r.difficulty
      }))
    };

    // 2. Push
    const res = await authedFetch('/v1/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    if (!res.ok) throw new Error('Sync failed');
    const data = await res.json();
    
    // 3. Apply pull + clear dirty in one transaction
    await db.withTransactionAsync(async () => {
      // Clear dirty for rows whose updatedAt is still what we sent
      // (If a local write happened while syncing, its updatedAt would be newer and we leave it dirty)
      for (const s of dirtySets) {
        await db.runAsync('UPDATE sets SET dirty = 0 WHERE id = ? AND updated_at = ?', [s.id, s.updated_at]);
      }
      for (const c of dirtyCards) {
        await db.runAsync('UPDATE cards SET dirty = 0 WHERE id = ? AND updated_at = ?', [c.id, c.updated_at]);
      }
      for (const q of dirtyQuiz) {
        await db.runAsync('UPDATE quiz SET dirty = 0 WHERE id = ? AND updated_at = ?', [q.id, q.updated_at]);
      }
      for (const r of dirtyReviews) {
        await db.runAsync('UPDATE review_log SET dirty = 0 WHERE id = ?', [r.id]);
      }
      // Activity dirty clear
      for (const a of dirtyActivity) {
        await db.runAsync('UPDATE activity SET dirty = 0 WHERE day = ? AND count = ?', [a.day, a.count]);
      }

      // Apply server data (LWW on updated_at)
      for (const s of data.sets) {
        const stored = await db.getFirstAsync<any>('SELECT updated_at FROM sets WHERE id = ?', [s.id]);
        if (!stored || s.updatedAt > stored.updated_at) {
          await db.runAsync(
            `INSERT OR REPLACE INTO sets (id, title, source, source_label, mode, exam_date, created_at, updated_at, deleted, dirty)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
            [s.id, s.title, s.source, s.sourceLabel, s.mode, s.examDate ? new Date(s.examDate).getTime() : null, s.createdAt, s.updatedAt, s.deleted ? 1 : 0]
          );
        }
      }

      for (const c of data.cards) {
        // Ensure set exists
        await db.runAsync(
          'INSERT OR IGNORE INTO sets (id, title, created_at, updated_at, deleted, dirty) VALUES (?, ?, ?, ?, 0, 0)',
          [c.setId, '(pending set)', c.updatedAt, c.updatedAt]
        );
        const stored = await db.getFirstAsync<any>('SELECT updated_at FROM cards WHERE id = ?', [c.id]);
        if (!stored || c.updatedAt > stored.updated_at) {
          await db.runAsync(
            `INSERT OR REPLACE INTO cards (id, set_id, front, back, easiness, interval, repetitions, due_date, updated_at, deleted, dirty, stability, difficulty, state, lapses, last_review)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
            [c.id, c.setId, c.front, c.back, c.easiness, c.interval, c.repetitions, c.dueDate ? new Date(c.dueDate).getTime() : null, c.updatedAt, c.deleted ? 1 : 0, c.stability, c.difficulty, c.state, c.lapses, c.lastReview]
          );
        }
      }

      for (const q of data.quiz) {
        await db.runAsync(
          'INSERT OR IGNORE INTO sets (id, title, created_at, updated_at, deleted, dirty) VALUES (?, ?, ?, ?, 0, 0)',
          [q.setId, '(pending set)', q.updatedAt, q.updatedAt]
        );
        const stored = await db.getFirstAsync<any>('SELECT updated_at FROM quiz WHERE id = ?', [q.id]);
        if (!stored || q.updatedAt > stored.updated_at) {
          await db.runAsync(
            `INSERT OR REPLACE INTO quiz (id, set_id, question, options_json, answer, explain, updated_at, deleted, dirty)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
            [q.id, q.setId, q.q, JSON.stringify(q.options), q.answer, q.explain, q.updatedAt, q.deleted ? 1 : 0]
          );
        }
      }

      for (const a of data.activity) {
        await db.runAsync(
          `INSERT INTO activity (day, count, dirty) VALUES (?, ?, 0)
           ON CONFLICT(day) DO UPDATE SET count = MAX(count, excluded.count)`,
          [a.day, a.count]
        );
      }

      for (const r of data.reviews) {
        await db.runAsync(
          `INSERT OR IGNORE INTO review_log (id, card_id, grade, prev_interval, new_interval, reviewed_at, kind, stability, difficulty, dirty)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          [r.id, r.cardId, r.grade, r.prevInterval, r.newInterval, r.reviewedAt, r.kind, r.stability, r.difficulty]
        );
      }
    });

    await setMeta('lastSync', data.serverTime);

  } finally {
    syncing = false;
  }
}
