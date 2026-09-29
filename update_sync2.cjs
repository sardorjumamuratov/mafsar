const fs = require("fs");
let c = fs.readFileSync("server/src/sync.ts", "utf8");

c = c.replace(/INSERT INTO sets \(id, user_id, title, source, source_label, mode, exam_date, created_at, updated_at, deleted, server_updated_at, chain_overrides\)/, `INSERT INTO sets (id, user_id, title, source, source_label, mode, exam_date, created_at, updated_at, deleted, server_updated_at, chain_overrides, description)`);
c = c.replace(/VALUES \(\?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?\)/, `VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
c = c.replace(/chain_overrides=COALESCE\(excluded\.chain_overrides, sets\.chain_overrides\)/, `chain_overrides=COALESCE(excluded.chain_overrides, sets.chain_overrides), description=COALESCE(excluded.description, sets.description)`);
c = c.replace(/s\.chainOverrides !== undefined \? JSON\.stringify\(s\.chainOverrides\) : null\]/, `s.chainOverrides !== undefined ? JSON.stringify(s.chainOverrides) : null, s.description !== undefined ? s.description : null]`);

fs.writeFileSync("server/src/sync.ts", c);
