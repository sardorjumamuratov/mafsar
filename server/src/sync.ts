import type { DB } from "./db.js";

import type { SyncBody } from "./schema.js";

// Offline-first sync: apply client mutations with last-write-wins on
// updated_at (tombstones win the same way), then return everything the
// server has changed since `since`. Idempotent: replaying the same batch
// is a no-op because rows are upserted by primary key.

interface Row {
  updated_at: string;
  deleted?: number;
}

/** True when the incoming row should overwrite the stored one. */
export function shouldWrite(stored: Row | undefined, incoming: Row): boolean {
  if (!stored) return true;
  return incoming.updated_at > stored.updated_at;
}

export function applySync(db: DB, userId: string, body: SyncBody): void {
  const tx = db.transaction(() => {
    for (const s of body.sets) {
      const stored = db
        .prepare("SELECT updated_at FROM sets WHERE id = ? AND user_id = ?")
        .get(s.id, userId) as Row | undefined;
      if (!shouldWrite(stored, { updated_at: s.updatedAt })) continue;
      db.prepare(
        `INSERT INTO sets (id, user_id, title, source, source_label, mode, exam_date, created_at, updated_at, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET title=excluded.title, source=excluded.source,
           source_label=excluded.source_label, mode=excluded.mode, exam_date=excluded.exam_date,
           updated_at=excluded.updated_at, deleted=excluded.deleted`,
      ).run(
        s.id, userId, s.title, s.source ?? null, s.sourceLabel ?? null,
        s.mode ?? "general", s.examDate ?? null, s.createdAt, s.updatedAt, s.deleted ? 1 : 0,
      );
    }

    // Cards/quizzes reference a set; ensure the set row exists even if the
    // client didn't send it in this batch (FK integrity).
    const ensureSet = db.prepare(
      "INSERT OR IGNORE INTO sets (id, user_id, title, created_at, updated_at) VALUES (?, ?, '(pending set)', ?, ?)",
    );
    for (const c of body.cards) {
      ensureSet.run(c.setId, userId, c.updatedAt, c.updatedAt);
      const stored = db
        .prepare("SELECT updated_at FROM cards WHERE id = ? AND user_id = ?")
        .get(c.id, userId) as Row | undefined;
      if (!shouldWrite(stored, { updated_at: c.updatedAt })) continue;
      db.prepare(
        `INSERT INTO cards (id, set_id, user_id, front, back, easiness, interval, repetitions, due_date, updated_at, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET front=excluded.front, back=excluded.back,
           easiness=excluded.easiness, interval=excluded.interval, repetitions=excluded.repetitions,
           due_date=excluded.due_date, updated_at=excluded.updated_at, deleted=excluded.deleted`,
      ).run(
        c.id, c.setId, userId, c.front, c.back, c.easiness ?? 2.5, c.interval ?? 0,
        c.repetitions ?? 0, c.dueDate ?? null, c.updatedAt, c.deleted ? 1 : 0,
      );
    }

    for (const q of body.quiz) {
      ensureSet.run(q.setId, userId, q.updatedAt, q.updatedAt);
      const stored = db
        .prepare("SELECT updated_at FROM quiz WHERE id = ? AND user_id = ?")
        .get(q.id, userId) as Row | undefined;
      if (!shouldWrite(stored, { updated_at: q.updatedAt })) continue;
      db.prepare(
        `INSERT INTO quiz (id, set_id, user_id, question, options_json, answer, explain, updated_at, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET question=excluded.question, options_json=excluded.options_json,
           answer=excluded.answer, explain=excluded.explain, updated_at=excluded.updated_at, deleted=excluded.deleted`,
      ).run(
        q.id, q.setId, userId, q.q, JSON.stringify(q.options), q.answer,
        q.explain ?? null, q.updatedAt, q.deleted ? 1 : 0,
      );
    }

    // Activity is a max-merge per day, not LWW — reviewing on two devices
    // on the same day should keep the larger count.
    for (const a of body.activity) {
      db.prepare(
        `INSERT INTO activity (user_id, day, count) VALUES (?, ?, ?)
         ON CONFLICT(user_id, day) DO UPDATE SET count = MAX(count, excluded.count)`,
      ).run(userId, a.day, a.count);
    }

    // Append-only review log; re-inserting the same id is a no-op.
    for (const r of body.reviews) {
      db.prepare(
        `INSERT OR IGNORE INTO review_log (id, user_id, card_id, grade, prev_interval, new_interval, reviewed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(r.id, userId, r.cardId, r.grade, r.prevInterval ?? 0, r.newInterval ?? 0, r.reviewedAt);
    }
  });
  tx();
}

/** Server-side rows changed since the given ISO timestamp, in client shapes. */
export function changesSince(db: DB, userId: string, since?: string) {
  const sinceEffective = since ?? "1970-01-01T00:00:00.000Z";
  const sets = (
    db
      .prepare("SELECT * FROM sets WHERE user_id = ? AND updated_at > ?")
      .all(userId, sinceEffective) as any[]
  ).map((r) => ({
    id: r.id, title: r.title, source: r.source, sourceLabel: r.source_label,
    mode: r.mode, examDate: r.exam_date, createdAt: r.created_at,
    updatedAt: r.updated_at, deleted: !!r.deleted,
  }));
  const cards = (
    db
      .prepare("SELECT * FROM cards WHERE user_id = ? AND updated_at > ?")
      .all(userId, sinceEffective) as any[]
  ).map((r) => ({
    id: r.id, setId: r.set_id, front: r.front, back: r.back,
    easiness: r.easiness, interval: r.interval, repetitions: r.repetitions,
    dueDate: r.due_date, updatedAt: r.updated_at, deleted: !!r.deleted,
  }));
  const quiz = (
    db
      .prepare("SELECT * FROM quiz WHERE user_id = ? AND updated_at > ?")
      .all(userId, sinceEffective) as any[]
  ).map((r) => ({
    id: r.id, setId: r.set_id, q: r.question, options: JSON.parse(r.options_json),
    answer: r.answer, explain: r.explain, updatedAt: r.updated_at,
    deleted: !!r.deleted,
  }));
  const activity = db
    .prepare("SELECT day, count FROM activity WHERE user_id = ?")
    .all(userId) as { day: string; count: number }[];
  const reviews = (
    db
      .prepare("SELECT * FROM review_log WHERE user_id = ? AND reviewed_at > ?")
      .all(userId, sinceEffective) as any[]
  ).map((r) => ({
    id: r.id, cardId: r.card_id, grade: r.grade,
    prevInterval: r.prev_interval, newInterval: r.new_interval,
    reviewedAt: r.reviewed_at,
  }));
  return { sets, cards, quiz, activity, reviews };
}
