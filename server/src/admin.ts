import { Hono } from "hono";
import { all, run, DB } from "./db.js";
import { isAdminEmail } from "./billing/core.js";
import { bumpCatalogue } from "./discover.js";

export function createAdminApp(db: DB) {
  const app = new Hono<{ Variables: { userId: string } }>();

app.use("*", async (c, next) => {
  const userId = c.get("userId");
    const rows = await all<{ email: string }>(db, "SELECT email FROM users WHERE id = ?", [userId]);
  if (!rows[0] || !isAdminEmail(rows[0].email)) {
    return c.json({ error: "forbidden", message: "Admin access required." }, 403);
  }
  await next();
});

app.get("/reports", async (c) => {
    const rows = await all(db, `
    SELECT r.id, r.set_id, r.reason, r.note, r.created_at, s.title, s.is_hidden, u.email
    FROM reports r
    JOIN sets s ON r.set_id = s.id
    JOIN users u ON r.user_id = u.id
    ORDER BY r.created_at DESC
  `);
  return c.json({ reports: rows });
});

app.post("/sets/:id/:action", async (c) => {
    const id = c.req.param("id");
  const action = c.req.param("action");
  
  if (action === "hide") {
    await run(db, "UPDATE sets SET is_hidden = 1 WHERE id = ?", [id]);
    bumpCatalogue();
  } else if (action === "restore") {
    await run(db, "UPDATE sets SET is_hidden = 0 WHERE id = ?", [id]);
    bumpCatalogue();
  } else if (action === "remove") {
    await run(db, "UPDATE sets SET deleted = 1 WHERE id = ?", [id]);
    bumpCatalogue();
  } else {
    return c.json({ error: "invalid_action" }, 400);
  }
  
  return c.json({ ok: true });
});

  return app;
}
