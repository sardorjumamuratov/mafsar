const fs = require("fs");
let syncCode = fs.readFileSync("server/src/sync.ts", "utf8");
const replaceTarget = "s.chainOverrides !== undefined ? JSON.stringify(s.chainOverrides) : null,\n        ]\n      );";
const newCode = `s.chainOverrides !== undefined ? JSON.stringify(s.chainOverrides) : null,
        ]
      );
      if (s.deleted) {
        // Find if this is a copy that was deleted, and if so, remove its rating
        const row = await db.query("SELECT origin_set_id FROM sets WHERE id = ?").all(s.id);
        const originId = row[0] ? row[0].origin_set_id : null;
        if (originId) {
          await db.query("DELETE FROM set_ratings WHERE set_root_id = ? AND user_id = ?").run(originId, userId);
          await db.query("UPDATE sets SET rating_count = (SELECT COUNT(*) FROM set_ratings WHERE set_root_id = ?), rating_sum = COALESCE((SELECT SUM(stars) FROM set_ratings WHERE set_root_id = ?), 0) WHERE id = ?").run(originId, originId, originId);
          await db.query("UPDATE sets SET rating_avg = CAST(rating_sum AS REAL) / rating_count WHERE id = ? AND rating_count > 0").run(originId);
          await db.query("UPDATE sets SET rating_avg = NULL WHERE id = ? AND rating_count = 0").run(originId);
        }
      }`;

syncCode = syncCode.replace(replaceTarget, newCode);
fs.writeFileSync("server/src/sync.ts", syncCode);
