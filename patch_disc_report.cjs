const fs = require("fs");
let disc = fs.readFileSync("server/src/discover.ts", "utf8");

const inject = `
  app.post("/:id/report", async (c) => {
    const userId = c.get("userId");
    const setId = c.req.param("id");
    const body = await c.req.json();
    const reason = body.reason || "inappropriate";
    
    await run(db, "INSERT OR IGNORE INTO reports (id, user_id, set_id, reason, created_at) VALUES (?, ?, ?, ?, ?)", [randomUUID(), userId, setId, reason, new Date().toISOString()]);
    
    const count = await one<{c:number}>(db, "SELECT COUNT(*) as c FROM reports WHERE set_id = ?", [setId]);
    if (count && count.c >= 3) {
      await run(db, "UPDATE sets SET is_hidden = 1 WHERE id = ?", [setId]);
      bumpCatalogue();
    }
    return c.json({ ok: true });
  });
`;

disc = disc.replace('const listLimiter = limitByUser(slidingWindow({ limit: 1000, windowMs: 24 * 3600 * 1000 }));', inject + '\n  const listLimiter = limitByUser(slidingWindow({ limit: 1000, windowMs: 24 * 3600 * 1000 }));');
fs.writeFileSync("server/src/discover.ts", disc);
