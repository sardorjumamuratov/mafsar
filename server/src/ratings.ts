import { Hono } from "hono";
import { DB, one, all } from "./db.js";
import { requireAuth } from "./auth.js";
import { limitByUser, slidingWindow } from "./ratelimit.js";
import { ratingSchema, ratingLookupSchema } from "./schema.js";

// Ratings live on the ROOT set (the original a global set was published from);
// a copy's rating counts toward its root. The aggregate columns on the root are
// recomputed from set_ratings inside the same batch as the write, so they can't
// drift. BEGIN/COMMIT as separate statements doesn't work over Turso's HTTP
// client (each execute is its own request), so the write is one db.batch.

const oneDecimal = (n: number | null | undefined) => (n == null ? null : Math.round(n * 10) / 10);

function aggregateStatements(rootId: string) {
  return [
    {
      sql: `UPDATE sets SET
              rating_count = (SELECT COUNT(*) FROM set_ratings WHERE set_root_id = ?),
              rating_sum = COALESCE((SELECT SUM(stars) FROM set_ratings WHERE set_root_id = ?), 0)
            WHERE id = ?`,
      args: [rootId, rootId, rootId],
    },
    {
      sql: `UPDATE sets SET rating_avg = CASE WHEN rating_count > 0 THEN CAST(rating_sum AS REAL) / rating_count ELSE NULL END,
              server_updated_at = ?
            WHERE id = ?`,
      args: [new Date().toISOString(), rootId],
    },
  ];
}

export function createRatingsApp(db: DB) {
  const app = new Hono<{ Variables: { userId: string } }>();
  const rateLimit = limitByUser(slidingWindow({ limit: 60, windowMs: 60_000 }));

  async function resolveRoot(id: string, userId: string) {
    const set = await one<{ origin_set_id: string | null }>(
      db, "SELECT origin_set_id FROM sets WHERE id = ? AND user_id = ? AND deleted = 0", [id, userId]
    );
    return set ? set.origin_set_id || id : null;
  }

  async function readAggregate(rootId: string) {
    const s = await one<{ rating_avg: number | null; rating_count: number | null }>(
      db, "SELECT rating_avg, rating_count FROM sets WHERE id = ?", [rootId]
    );
    return { avg: oneDecimal(s?.rating_avg), count: Number(s?.rating_count ?? 0) };
  }

  app.put("/sets/:id/rating", requireAuth(), rateLimit, async (c) => {
    const userId = c.get("userId");
    const parsed = ratingSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "bad_request", message: "Stars must be a whole number from 1 to 5." }, 400);
    const rootId = await resolveRoot(c.req.param("id"), userId);
    if (!rootId) return c.json({ error: "not_found", message: "No such set for this account." }, 404);

    const now = new Date().toISOString();
    await db.batch([
      {
        sql: `INSERT INTO set_ratings (set_root_id, user_id, stars, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(set_root_id, user_id) DO UPDATE SET stars = excluded.stars, updated_at = excluded.updated_at`,
        args: [rootId, userId, parsed.data.stars, now, now],
      },
      ...aggregateStatements(rootId),
    ], "write");
    return c.json({ yourStars: parsed.data.stars, ...(await readAggregate(rootId)) });
  });

  app.delete("/sets/:id/rating", requireAuth(), rateLimit, async (c) => {
    const userId = c.get("userId");
    const rootId = await resolveRoot(c.req.param("id"), userId);
    if (!rootId) return c.json({ error: "not_found", message: "No such set for this account." }, 404);

    await db.batch([
      { sql: "DELETE FROM set_ratings WHERE set_root_id = ? AND user_id = ?", args: [rootId, userId] },
      ...aggregateStatements(rootId),
    ], "write");
    return c.json({ yourStars: null, ...(await readAggregate(rootId)) });
  });

  app.post("/ratings/lookup", requireAuth(), async (c) => {
    const userId = c.get("userId");
    const parsed = ratingLookupSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "bad_request", message: "Send up to 200 set ids." }, 400);
    const ids = parsed.data.ids;
    if (!ids.length) return c.json({});

    // The client keys its store by ROOT id (a copy's rating belongs to its
    // original), so ids may be the learner's own set ids or the roots of their
    // copies. Only roots the learner owns or has copied are answered.
    const placeholders = ids.map(() => "?").join(",");
    const rows = await all<any>(db, `
      SELECT COALESCE(s.origin_set_id, s.id) AS root_id, r.rating_avg, r.rating_count, r.is_global, sr.stars
      FROM sets s
      LEFT JOIN sets r ON r.id = COALESCE(s.origin_set_id, s.id)
      LEFT JOIN set_ratings sr ON sr.set_root_id = COALESCE(s.origin_set_id, s.id) AND sr.user_id = ?
      WHERE s.user_id = ? AND s.deleted = 0
        AND (s.id IN (${placeholders}) OR s.origin_set_id IN (${placeholders}))
    `, [userId, userId, ...ids, ...ids]);

    const res: Record<string, { yourStars: number | null; ratingAvg: number | null; ratingCount: number; isGlobal: boolean }> = {};
    for (const r of rows) {
      res[r.root_id] = {
        yourStars: r.stars ?? null,
        ratingAvg: oneDecimal(r.rating_avg),
        ratingCount: Number(r.rating_count ?? 0),
        isGlobal: !!r.is_global,
      };
    }
    return c.json(res);
  });

  return app;
}
