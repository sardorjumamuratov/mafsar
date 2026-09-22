import type { DB } from "./db.js";
import { one, all, run, nowISO } from "./db.js";
import type { SyncBody } from "./schema.js";

// Offline-first sync: apply client mutations with last-write-wins on
// updated_at (tombstones win the same way), then return everything the
// server has changed since `since`. Idempotent: replaying the same batch
// is a no-op because rows are upserted by primary key.
//
// `since` is compared with server_updated_at (when the SERVER stored the row),
// not the client-supplied updated_at. A device whose clock runs behind would
// otherwise write rows that other devices never pull.

interface Row {
  updated_at: string;
  deleted?: number;
}

/** True when the incoming row should overwrite the stored one. */
export function shouldWrite(stored: Row | undefined, incoming: Row): boolean {
  if (!stored) return true;
  return incoming.updated_at > stored.updated_at;
}

/**
 * Every upsert below carries `WHERE <table>.user_id = excluded.user_id`.
 * Row ids are client-generated, and the primary key is the id alone, so
 * without that guard an authenticated user could overwrite another user's
 * row by pushing a colliding id — the ownership check in the preceding
 * SELECT passes vacuously (it finds nothing for *this* user) and the
 * ON CONFLICT branch then edits the other user's row in place. With the
 * guard the conflicting write is a no-op. A composite (id, user_id) primary
 * key would express this in the schema, but that needs a data migration.
 */
export async function applySync(db: DB, userId: string, body: SyncBody): Promise<void> {
  const now = nowISO();

  for (const s of body.sets) {
    const stored = await one<Row>(
      db, "SELECT updated_at FROM sets WHERE id = ? AND user_id = ?", [s.id, userId]
    );
    if (!shouldWrite(stored, { updated_at: s.updatedAt })) continue;
    await run(
      db,
      `INSERT INTO sets (id, user_id, title, source, source_label, mode, exam_date, created_at, updated_at, deleted, server_updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET title=excluded.title, source=excluded.source,
         source_label=excluded.source_label, mode=excluded.mode, exam_date=excluded.exam_date,
         updated_at=excluded.updated_at, deleted=excluded.deleted, server_updated_at=excluded.server_updated_at
       WHERE sets.user_id = excluded.user_id`,
      [s.id, userId, s.title, s.source ?? null, s.sourceLabel ?? null,
       s.mode ?? "general", s.examDate ?? null, s.createdAt, s.updatedAt, s.deleted ? 1 : 0, now]
    );
  }

  // Cards/quizzes reference a set; ensure the set row exists even if the
  // client didn't send it in this batch (FK integrity).
  for (const c of body.cards) {
    await run(
      db,
      "INSERT OR IGNORE INTO sets (id, user_id, title, created_at, updated_at, server_updated_at) VALUES (?, ?, '(pending set)', ?, ?, ?)",
      [c.setId, userId, c.updatedAt, c.updatedAt, now]
    );
    const stored = await one<Row>(
      db, "SELECT updated_at FROM cards WHERE id = ? AND user_id = ?", [c.id, userId]
    );
    if (!shouldWrite(stored, { updated_at: c.updatedAt })) continue;
    await run(
      db,
      `INSERT INTO cards (id, set_id, user_id, front, back, easiness, interval, repetitions, due_date, updated_at, deleted, server_updated_at, stability, difficulty, state, lapses, last_review)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET front=excluded.front, back=excluded.back,
         easiness=excluded.easiness, interval=excluded.interval, repetitions=excluded.repetitions,
         due_date=excluded.due_date, updated_at=excluded.updated_at, deleted=excluded.deleted, server_updated_at=excluded.server_updated_at, stability=excluded.stability, difficulty=excluded.difficulty, state=excluded.state, lapses=excluded.lapses, last_review=excluded.last_review
       WHERE cards.user_id = excluded.user_id`,
      [c.id, c.setId, userId, c.front, c.back, c.easiness ?? 2.5, c.interval ?? 0,
       c.repetitions ?? 0, c.dueDate ?? null, c.updatedAt, c.deleted ? 1 : 0, now, c.stability ?? null, c.difficulty ?? null, c.state ?? null, c.lapses ?? 0, c.lastReview ?? null]
    );
  }

  for (const q of body.quiz) {
    await run(
      db,
      "INSERT OR IGNORE INTO sets (id, user_id, title, created_at, updated_at, server_updated_at) VALUES (?, ?, '(pending set)', ?, ?, ?)",
      [q.setId, userId, q.updatedAt, q.updatedAt, now]
    );
    const stored = await one<Row>(
      db, "SELECT updated_at FROM quiz WHERE id = ? AND user_id = ?", [q.id, userId]
    );
    if (!shouldWrite(stored, { updated_at: q.updatedAt })) continue;
    await run(
      db,
      `INSERT INTO quiz (id, set_id, user_id, question, options_json, answer, explain, updated_at, deleted, server_updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET question=excluded.question, options_json=excluded.options_json,
         answer=excluded.answer, explain=excluded.explain, updated_at=excluded.updated_at, deleted=excluded.deleted, server_updated_at=excluded.server_updated_at
       WHERE quiz.user_id = excluded.user_id`,
      [q.id, q.setId, userId, q.q, JSON.stringify(q.options), q.answer,
       q.explain ?? null, q.updatedAt, q.deleted ? 1 : 0, now]
    );
  }

  // Activity is a max-merge per day, not LWW — reviewing on two devices
  // on the same day should keep the larger count.
  for (const a of body.activity) {
    await run(
      db,
      `INSERT INTO activity (user_id, day, count) VALUES (?, ?, ?)
       ON CONFLICT(user_id, day) DO UPDATE SET count = MAX(count, excluded.count)`,
      [userId, a.day, a.count]
    );
  }

  // Mechanism chains (Medicine mode). Same last-write-wins and user_id guard as
  // cards. Chains go first so their steps have a parent row.
  for (const ch of body.chains ?? []) {
    await run(
      db,
      "INSERT OR IGNORE INTO sets (id, user_id, title, created_at, updated_at, server_updated_at) VALUES (?, ?, '(pending set)', ?, ?, ?)",
      [ch.setId, userId, ch.updatedAt, ch.updatedAt, now]
    );
    const stored = await one<Row>(db, "SELECT updated_at FROM chains WHERE id = ? AND user_id = ?", [ch.id, userId]);
    if (!shouldWrite(stored, { updated_at: ch.updatedAt })) continue;
    await run(
      db,
      `INSERT INTO chains (id, set_id, user_id, template, title, updated_at, server_updated_at, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET template=excluded.template, title=excluded.title,
         updated_at=excluded.updated_at, server_updated_at=excluded.server_updated_at, deleted=excluded.deleted
       WHERE chains.user_id = excluded.user_id`,
      [ch.id, ch.setId, userId, ch.template, ch.title, ch.updatedAt, now, ch.deleted ? 1 : 0]
    );
  }

  for (const st of body.chainSteps ?? []) {
    // A step whose chain this user doesn't own (or that never arrived) is dropped.
    const parent = await one(db, "SELECT 1 AS x FROM chains WHERE id = ? AND user_id = ?", [st.chainId, userId]);
    if (!parent) continue;
    const stored = await one<Row>(db, "SELECT updated_at FROM chain_steps WHERE id = ? AND user_id = ?", [st.id, userId]);
    if (!shouldWrite(stored, { updated_at: st.updatedAt })) continue;
    await run(
      db,
      `INSERT INTO chain_steps (id, chain_id, user_id, key, statement, why, edited, updated_at, server_updated_at, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET key=excluded.key, statement=excluded.statement, why=excluded.why,
         edited=excluded.edited, updated_at=excluded.updated_at, server_updated_at=excluded.server_updated_at,
         deleted=excluded.deleted
       WHERE chain_steps.user_id = excluded.user_id`,
      [st.id, st.chainId, userId, st.key, st.statement, st.why ?? "", st.edited ? 1 : 0, st.updatedAt, now, st.deleted ? 1 : 0]
    );
  }

  // Append-only review log; re-inserting the same id is a no-op.
  for (const r of body.reviews) {
    await run(
      db,
      `INSERT OR IGNORE INTO review_log (id, user_id, card_id, grade, prev_interval, new_interval, reviewed_at, received_at, kind, stability, difficulty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [r.id, userId, r.cardId, r.grade, r.prevInterval ?? 0, r.newInterval ?? 0, r.reviewedAt, now, r.kind ?? "flashcard", r.stability ?? null, r.difficulty ?? null]
    );
  }
}

/** Server-side rows changed since the given ISO timestamp, in client shapes. */
export async function changesSince(db: DB, userId: string, since?: string) {
  const sinceEffective = since ?? "1970-01-01T00:00:00.000Z";
  const sets = (await all<any>(
    db, "SELECT * FROM sets WHERE user_id = ? AND server_updated_at > ?", [userId, sinceEffective]
  )).map((r) => ({
    id: r.id, title: r.title, source: r.source, sourceLabel: r.source_label,
    mode: r.mode, examDate: r.exam_date, createdAt: r.created_at,
    updatedAt: r.updated_at, deleted: !!r.deleted,
  }));
  const cards = (await all<any>(
    db, "SELECT * FROM cards WHERE user_id = ? AND server_updated_at > ?", [userId, sinceEffective]
  )).map((r) => ({
    id: r.id, setId: r.set_id, front: r.front, back: r.back,
    easiness: r.easiness, interval: r.interval, repetitions: r.repetitions,
    // Stored as ISO (the server_updated_at migration converted legacy epoch-ms strings). The old
    // Number() coercion turned ISO into NaN, i.e. null: every pulled card
    // looked due immediately on a new device.
    dueDate: r.due_date,
    updatedAt: r.updated_at, deleted: !!r.deleted,
    stability: r.stability, difficulty: r.difficulty, state: r.state, lapses: r.lapses, lastReview: r.last_review,
  }));
  const quiz = (await all<any>(
    db, "SELECT * FROM quiz WHERE user_id = ? AND server_updated_at > ?", [userId, sinceEffective]
  )).map((r) => ({
    id: r.id, setId: r.set_id, q: r.question, options: JSON.parse(r.options_json),
    answer: r.answer, explain: r.explain, updatedAt: r.updated_at,
    deleted: !!r.deleted,
  }));
  const activity = await all<{ day: string; count: number }>(
    db, "SELECT day, count FROM activity WHERE user_id = ?", [userId]
  );
  const reviews = (await all<any>(
    db, "SELECT * FROM review_log WHERE user_id = ? AND received_at > ?", [userId, sinceEffective]
  )).map((r) => ({
    id: r.id, cardId: r.card_id, grade: r.grade,
    prevInterval: r.prev_interval, newInterval: r.new_interval,
    reviewedAt: r.reviewed_at,
    kind: r.kind, stability: r.stability, difficulty: r.difficulty,
  }));
  const chains = (await all<any>(
    db, "SELECT * FROM chains WHERE user_id = ? AND server_updated_at > ?", [userId, sinceEffective]
  )).map((r) => ({
    id: r.id, setId: r.set_id, template: r.template, title: r.title,
    updatedAt: r.updated_at, deleted: !!r.deleted,
  }));
  const chainSteps = (await all<any>(
    db, "SELECT * FROM chain_steps WHERE user_id = ? AND server_updated_at > ?", [userId, sinceEffective]
  )).map((r) => ({
    id: r.id, chainId: r.chain_id, key: r.key, statement: r.statement, why: r.why,
    edited: !!r.edited, updatedAt: r.updated_at, deleted: !!r.deleted,
  }));
  return { sets, cards, quiz, activity, reviews, chains, chainSteps };
}
