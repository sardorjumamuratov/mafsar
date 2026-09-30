import { Hono } from "hono";
import { z } from "zod";
import { DB, run, one, all } from "./db.js";
import { requireAuth } from "./auth.js";
import { limitByUser, slidingWindow } from "./ratelimit.js";


export function createRatingsApp(db: DB) {
  const app = new Hono();

  async function updateAggregates(rootId: string) {
    await run(db, `
      UPDATE sets 
      SET 
        rating_count = (SELECT COUNT(*) FROM set_ratings WHERE set_root_id = ?),
        rating_sum = COALESCE((SELECT SUM(stars) FROM set_ratings WHERE set_root_id = ?), 0)
      WHERE id = ?
    `, [rootId, rootId, rootId]);
    await run(db, `
      UPDATE sets 
      SET rating_avg = CAST(rating_sum AS REAL) / rating_count 
      WHERE id = ? AND rating_count > 0
    `, [rootId]);
    await run(db, `
      UPDATE sets 
      SET rating_avg = NULL 
      WHERE id = ? AND rating_count = 0
    `, [rootId]);
    const s = await one<{ rating_avg: number | null, rating_count: number }>(db, "SELECT rating_avg, rating_count FROM sets WHERE id = ?", [rootId]);
    return { avg: s?.rating_avg || null, count: s?.rating_count || 0 };
  }

  // Rate limited to ~60 writes a minute (we'll just use a standard limit, e.g. 60 per minute is basically 1 per sec)
  const rateLimit = limitByUser(slidingWindow({ limit: 60, windowMs: 60000 }));

  app.put("/v1/sets/:id/rating", requireAuth, rateLimit, async (c) => {
    const userId = c.get("userId") as string;
    const id = c.req.param("id");
    const body = await c.req.json();
    const stars = body.stars;
    if (typeof stars !== "number" || stars < 1 || stars > 5) return c.json({error: "bad_request"}, 400);

    // Check ownership and resolve root
    const set = await one<{ origin_set_id: string | null }>(db, "SELECT origin_set_id FROM sets WHERE id = ? AND user_id = ? AND deleted = 0", [id, userId]);
    if (!set) return c.json({ error: "not_found" }, 404);

    const rootId = set.origin_set_id || id;
    
    // Begin transaction for upsert + aggregate update
    await run(db, "BEGIN IMMEDIATE");
    try {
      await run(db, `
        INSERT INTO set_ratings (set_root_id, user_id, stars, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(set_root_id, user_id) DO UPDATE SET stars = excluded.stars, updated_at = excluded.updated_at
      `, [rootId, userId, stars, new Date().toISOString()]);
      
      const { avg, count } = await updateAggregates(rootId);
      await run(db, "COMMIT");
      return c.json({ yourStars: stars, avg, count });
    } catch (e) {
      await run(db, "ROLLBACK");
      throw e;
    }
  });

  app.delete("/v1/sets/:id/rating", requireAuth, rateLimit, async (c) => {
    const userId = c.get("userId") as string;
    const id = c.req.param("id");

    const set = await one<{ origin_set_id: string | null }>(db, "SELECT origin_set_id FROM sets WHERE id = ? AND user_id = ? AND deleted = 0", [id, userId]);
    if (!set) return c.json({ error: "not_found" }, 404);

    const rootId = set.origin_set_id || id;
    
    await run(db, "BEGIN IMMEDIATE");
    try {
      await run(db, "DELETE FROM set_ratings WHERE set_root_id = ? AND user_id = ?", [rootId, userId]);
      const { avg, count } = await updateAggregates(rootId);
      await run(db, "COMMIT");
      return c.json({ yourStars: null, avg, count });
    } catch (e) {
      await run(db, "ROLLBACK");
      throw e;
    }
  });

  app.post("/v1/ratings/lookup", requireAuth, async (c) => {
    const userId = c.get("userId") as string;
    const body = await c.req.json();
    const ids = body.ids;
    if (!Array.isArray(ids)) return c.json({error: "bad_request"}, 400);
    if (ids.length === 0) return c.json({});

    const placeholders = ids.map(() => "?").join(",");
    // ids are the learner's set ids. We must resolve their root ids to get the aggregates, 
    // and also fetch the user's rating.
    const rows = await all<any>(db, `
      SELECT 
        s.id as client_id,
        COALESCE(s.origin_set_id, s.id) as root_id,
        r.rating_avg,
        r.rating_count,
        r.is_global,
        sr.stars
      FROM sets s
      LEFT JOIN sets r ON r.id = COALESCE(s.origin_set_id, s.id)
      LEFT JOIN set_ratings sr ON sr.set_root_id = COALESCE(s.origin_set_id, s.id) AND sr.user_id = ?
      WHERE s.id IN (${placeholders}) AND s.user_id = ? AND s.deleted = 0
    `, [userId, ...ids, userId]);

    const res: Record<string, any> = {};
    for (const r of rows) {
      res[r.client_id] = {
        yourStars: r.stars || null,
        ratingAvg: r.rating_avg || null,
        ratingCount: r.rating_count || 0,
        isGlobal: !!r.is_global
      };
    }
    return c.json(res);
  });

  return app;
}
