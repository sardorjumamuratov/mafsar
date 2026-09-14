const fs = require("fs");
let s = fs.readFileSync("server/src/sync.ts", "utf8");
s = s.replace(
  /deleted=excluded\.deleted, server_updated_at=excluded\.server_updated_at\r?\n\s*WHERE cards\.user_id = excluded\.user_id/,
  `deleted=excluded.deleted, server_updated_at=excluded.server_updated_at, stability=excluded.stability, difficulty=excluded.difficulty, state=excluded.state, lapses=excluded.lapses, last_review=excluded.last_review\n       WHERE cards.user_id = excluded.user_id`
);
fs.writeFileSync("server/src/sync.ts", s);
