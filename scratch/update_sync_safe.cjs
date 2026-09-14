const fs = require("fs");
let s = fs.readFileSync("server/src/sync.ts", "utf8");

s = s.replace(
  "INSERT INTO cards (id, set_id, user_id, front, back, easiness, interval, repetitions, due_date, updated_at, deleted, server_updated_at)",
  "INSERT INTO cards (id, set_id, user_id, front, back, easiness, interval, repetitions, due_date, updated_at, deleted, server_updated_at, stability, difficulty, state, lapses, last_review)"
);

s = s.replace(
  "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
);

s = s.replace(
  "due_date=excluded.due_date, updated_at=excluded.updated_at, deleted=excluded.deleted, server_updated_at=excluded.server_updated_at\\n       WHERE cards.user_id = excluded.user_id",
  "due_date=excluded.due_date, updated_at=excluded.updated_at, deleted=excluded.deleted, server_updated_at=excluded.server_updated_at, stability=excluded.stability, difficulty=excluded.difficulty, state=excluded.state, lapses=excluded.lapses, last_review=excluded.last_review\\n       WHERE cards.user_id = excluded.user_id"
);

// Need to match exactly what is there. Let's use regex that targets cards table explicitly:
s = s.replace(
  /due_date=excluded\.due_date, updated_at=excluded\.updated_at, deleted=excluded\.deleted, server_updated_at=excluded\.server_updated_at\r?\n       WHERE cards\.user_id = excluded\.user_id/,
  `due_date=excluded.due_date, updated_at=excluded.updated_at, deleted=excluded.deleted, server_updated_at=excluded.server_updated_at, stability=excluded.stability, difficulty=excluded.difficulty, state=excluded.state, lapses=excluded.lapses, last_review=excluded.last_review\n       WHERE cards.user_id = excluded.user_id`
);

s = s.replace(
  `c.repetitions ?? 0, c.dueDate ?? null, c.updatedAt, c.deleted ? 1 : 0, now]`,
  `c.repetitions ?? 0, c.dueDate ?? null, c.updatedAt, c.deleted ? 1 : 0, now, c.stability ?? null, c.difficulty ?? null, c.state ?? null, c.lapses ?? 0, c.lastReview ?? null]`
);

s = s.replace(
  "INSERT OR IGNORE INTO review_log (id, user_id, card_id, grade, prev_interval, new_interval, reviewed_at, received_at)",
  "INSERT OR IGNORE INTO review_log (id, user_id, card_id, grade, prev_interval, new_interval, reviewed_at, received_at, kind, stability, difficulty)"
);

s = s.replace(
  "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
);

s = s.replace(
  `[r.id, userId, r.cardId, r.grade, r.prevInterval ?? 0, r.newInterval ?? 0, r.reviewedAt, now]`,
  `[r.id, userId, r.cardId, r.grade, r.prevInterval ?? 0, r.newInterval ?? 0, r.reviewedAt, now, r.kind ?? "flashcard", r.stability ?? null, r.difficulty ?? null]`
);

s = s.replace(
  /dueDate: r\.due_date,\r?\n    updatedAt: r\.updated_at, deleted: !!r\.deleted,/,
  `dueDate: r.due_date,\n    updatedAt: r.updated_at, deleted: !!r.deleted,\n    stability: r.stability, difficulty: r.difficulty, state: r.state, lapses: r.lapses, lastReview: r.last_review,`
);

s = s.replace(
  /prevInterval: r\.prev_interval, newInterval: r\.new_interval,\r?\n    reviewedAt: r\.reviewed_at,/,
  `prevInterval: r.prev_interval, newInterval: r.new_interval,\n    reviewedAt: r.reviewed_at,\n    kind: r.kind, stability: r.stability, difficulty: r.difficulty,`
);

fs.writeFileSync("server/src/sync.ts", s);
