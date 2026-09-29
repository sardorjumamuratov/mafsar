const fs = require('fs');
let c = fs.readFileSync('server/src/sync.ts', 'utf8');

const oldSetsQuery = `  const sets = (await all<any>(
    db, "SELECT * FROM sets WHERE user_id = ? AND server_updated_at > ?", [userId, sinceEffective]
  )).map((r) => ({
    id: r.id, title: r.title, source: r.source, sourceLabel: r.source_label,
    mode: r.mode, examDate: r.exam_date, createdAt: r.created_at,
    updatedAt: r.updated_at, deleted: !!r.deleted, chainOverrides: r.chain_overrides ? JSON.parse(r.chain_overrides) : undefined,
  }));`;

const newSetsQuery = `  const sets = (await all<any>(
    db, \`SELECT s.*,
           (SELECT COUNT(rating) FROM sets g WHERE g.source = 'global' AND g.source_label = s.id) as global_rating_count,
           (SELECT AVG(rating) FROM sets g WHERE g.source = 'global' AND g.source_label = s.id) as global_rating_avg
         FROM sets s 
         WHERE s.user_id = ? AND s.server_updated_at > ?\`, [userId, sinceEffective]
  )).map((r) => ({
    id: r.id, title: r.title, source: r.source, sourceLabel: r.source_label,
    mode: r.mode, examDate: r.exam_date, createdAt: r.created_at,
    updatedAt: r.updated_at, deleted: !!r.deleted, chainOverrides: r.chain_overrides ? JSON.parse(r.chain_overrides) : undefined,
    rating: r.rating ?? undefined,
    published: r.published ? 1 : 0,
    globalRatingCount: r.global_rating_count || 0,
    globalRatingAvg: r.global_rating_avg || 0,
  }));`;

c = c.replace(oldSetsQuery, newSetsQuery);
fs.writeFileSync('server/src/sync.ts', c);
