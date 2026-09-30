const fs = require("fs");
let sync = fs.readFileSync("server/src/sync.ts", "utf8");

// update PUSH for cards
sync = sync.replace(
  'due_date, updated_at, deleted, server_updated_at, stability, difficulty, state, lapses, last_review)',
  'due_date, updated_at, deleted, server_updated_at, stability, difficulty, state, lapses, last_review, origin_card_id, detached)'
);
sync = sync.replace(
  'c.repetitions ?? 0, c.dueDate ?? null, c.updatedAt, c.deleted ? 1 : 0, now, c.stability ?? null, c.difficulty ?? null, c.state ?? null, c.lapses ?? 0, c.lastReview ?? null]',
  'c.repetitions ?? 0, c.dueDate ?? null, c.updatedAt, c.deleted ? 1 : 0, now, c.stability ?? null, c.difficulty ?? null, c.state ?? null, c.lapses ?? 0, c.lastReview ?? null, c.originCardId ?? null, c.detached ? 1 : 0]'
);
sync = sync.replace(
  'state=excluded.state, lapses=excluded.lapses, last_review=excluded.last_review',
  'state=excluded.state, lapses=excluded.lapses, last_review=excluded.last_review, origin_card_id=COALESCE(excluded.origin_card_id, cards.origin_card_id), detached=COALESCE(excluded.detached, cards.detached)'
);

// update PULL for cards
sync = sync.replace(
  'deleted: !!r.deleted,',
  'deleted: !!r.deleted,\n      originCardId: r.origin_card_id, detached: !!r.detached,'
);

// PULL logic to update copies from root cards
const pullInject = `
    // Before we pull, we must propagate owner edits to copies.
    // We find all cards the user owns that have an origin_card_id, are not detached,
    // and where the root card's updated_at > this card's updated_at.
    await db.query(\`
      UPDATE cards
      SET 
        front = (SELECT front FROM cards root WHERE root.id = cards.origin_card_id),
        back = (SELECT back FROM cards root WHERE root.id = cards.origin_card_id),
        updated_at = (SELECT updated_at FROM cards root WHERE root.id = cards.origin_card_id),
        server_updated_at = ?
      WHERE cards.user_id = ? AND cards.origin_card_id IS NOT NULL AND cards.detached = 0
        AND EXISTS (
          SELECT 1 FROM cards root 
          WHERE root.id = cards.origin_card_id 
            AND root.updated_at > cards.updated_at
        )
    \`).run(now, userId);
`;
sync = sync.replace('const now = new Date().toISOString();', 'const now = new Date().toISOString();' + pullInject);

fs.writeFileSync("server/src/sync.ts", sync);
