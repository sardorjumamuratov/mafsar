const fs = require("fs");

// 1. db.ts
let dbCode = fs.readFileSync("server/src/db.ts", "utf8");
dbCode = dbCode.replace('];\n\nexport async function migrate', '  `\n    ALTER TABLE cards ADD COLUMN origin_card_id TEXT;\n    ALTER TABLE cards ADD COLUMN detached INTEGER NOT NULL DEFAULT 0;\n  `\n];\n\nexport async function migrate');
fs.writeFileSync("server/src/db.ts", dbCode);

// 2. discover.ts
let disc = fs.readFileSync("server/src/discover.ts", "utf8");
disc = disc.replace(
  '"INSERT INTO cards (id, set_id, user_id, front, back, created_at, updated_at, easiness, interval, repetitions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",\n          [randomUUID(), newSetId, userId, card.front, card.back, now, now, 2.5, 0, 0]',
  '"INSERT INTO cards (id, set_id, user_id, front, back, created_at, updated_at, easiness, interval, repetitions, origin_card_id, detached) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)",\n          [randomUUID(), newSetId, userId, card.front, card.back, now, now, 2.5, 0, 0, card.id]'
);
fs.writeFileSync("server/src/discover.ts", disc);
