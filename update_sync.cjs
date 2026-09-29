const fs = require('fs');
let c = fs.readFileSync('server/src/sync.ts', 'utf8');

const oldSets = `    await run(
      db,
      \`INSERT INTO sets (id, user_id, title, source, source_label, mode, exam_date, created_at, updated_at, deleted, server_updated_at, chain_overrides)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET title=excluded.title, source=excluded.source,
           source_label=excluded.source_label, mode=excluded.mode, exam_date=excluded.exam_date,
           updated_at=excluded.updated_at, deleted=excluded.deleted, server_updated_at=excluded.server_updated_at,
           chain_overrides=COALESCE(excluded.chain_overrides, sets.chain_overrides)
         WHERE sets.user_id = excluded.user_id\`,
      [s.id, userId, s.title, s.source ?? null, s.sourceLabel ?? null,
       s.mode ?? "general", s.examDate ?? null, s.createdAt, s.updatedAt, s.deleted ? 1 : 0, now, s.chainOverrides !== undefined ? JSON.stringify(s.chainOverrides) : null]
    );`;

const newSets = `    await run(
      db,
      \`INSERT INTO sets (id, user_id, title, source, source_label, mode, exam_date, created_at, updated_at, deleted, server_updated_at, chain_overrides, rating)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET title=excluded.title, source=excluded.source,
           source_label=excluded.source_label, mode=excluded.mode, exam_date=excluded.exam_date,
           updated_at=excluded.updated_at, deleted=excluded.deleted, server_updated_at=excluded.server_updated_at,
           chain_overrides=COALESCE(excluded.chain_overrides, sets.chain_overrides),
           rating=CASE WHEN excluded.rating = -1 THEN sets.rating ELSE excluded.rating END
         WHERE sets.user_id = excluded.user_id\`,
      [s.id, userId, s.title, s.source ?? null, s.sourceLabel ?? null,
       s.mode ?? "general", s.examDate ?? null, s.createdAt, s.updatedAt, s.deleted ? 1 : 0, now, s.chainOverrides !== undefined ? JSON.stringify(s.chainOverrides) : null, s.rating !== undefined ? (s.rating === null ? null : s.rating) : -1]
    );`;

c = c.replace(oldSets, newSets);
fs.writeFileSync('server/src/sync.ts', c);
