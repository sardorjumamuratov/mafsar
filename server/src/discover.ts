import { Hono } from "hono";
import { all, one, run, DB } from "./db.js";
import { randomUUID } from "crypto";
import { cleanSetTitle } from "./llm.js";
import { limitByUser, slidingWindow } from "./ratelimit.js";

let catalogueVersion = 1;
export function bumpCatalogue() { catalogueVersion++; }

let globalMeanRating = 4.0;
export async function recomputeMeanRating(db: DB) {
  const row = await one<{ m: number }>(db, "SELECT AVG(rating_avg) as m FROM sets WHERE is_global = 1 AND deleted = 0 AND rating_count > 0");
  if (row && row.m) globalMeanRating = row.m;
}

const cache = new Map<string, { version: number; expires: number; data: any }>();

export function createDiscoverApp(db: DB) {
  const app = new Hono<{ Variables: { userId: string } }>();

  const publishLimiter = limitByUser(slidingWindow({ limit: 10, windowMs: 24 * 3600 * 1000 }));
  app.post("/:id/publish", publishLimiter, async (c) => {
    const userId = c.get("userId");
    const setId = c.req.param("id");
    
    const set = await one<any>(db, "SELECT * FROM sets WHERE id = ? AND user_id = ? AND deleted = 0", [setId, userId]);
    if (!set) return c.json({ error: "not_found" }, 404);
    
    if (set.source === "quizlet" || set.source === "anki" || set.source === "shared" || set.is_global) {
      return c.json({ error: "invalid_source", message: "Only your own sets can be published." }, 400);
    }
    
    const cards = await all<any>(db, "SELECT front, back FROM cards WHERE set_id = ? AND deleted = 0", [setId]);
    if (cards.length < 5) {
      return c.json({ error: "too_short", message: "A set needs at least 5 cards to be published." }, 400);
    }
    
    try {
      const cleanTitle = await cleanSetTitle(set.title);
      if (cleanTitle === "UNSAFE") {
        return c.json({ error: "safety", message: "Set title was flagged by safety filters." }, 400);
      }
      await run(db, "UPDATE sets SET is_global = 1, title = ?, updated_at = ? WHERE id = ?", [cleanTitle, new Date().toISOString(), setId]);
      bumpCatalogue();
      return c.json({ ok: true, title: cleanTitle });
    } catch(e) {
      return c.json({ error: 'llm_error', message: 'Safety check failed, try again later.' }, 503);
    }
  });

  app.post("/:id/unpublish", async (c) => {
    const userId = c.get("userId");
    const setId = c.req.param("id");
    await run(db, "UPDATE sets SET is_global = 0, updated_at = ? WHERE id = ? AND user_id = ?", [new Date().toISOString(), setId, userId]);
    bumpCatalogue();
    return c.json({ ok: true });
  });

  const listLimiter = limitByUser(slidingWindow({ limit: 1000, windowMs: 24 * 3600 * 1000 }));
  app.get("/", listLimiter, async (c) => {
    const userId = c.get("userId");
    const tab = c.req.query("tab") || "for";
    const q = (c.req.query("q") || "").trim().toLowerCase();
    const cursor = Number(c.req.query("cursor") || "0");
    
    const cacheKey = `${userId}:${tab}:${q}:${cursor}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.version === catalogueVersion && cached.expires > Date.now()) {
      return c.json(cached.data);
    }

    let query = `
      SELECT 
        s.id, s.title, s.description, s.source, s.source_label as sourceLabel,
        s.created_at as published_at, s.is_global as isGlobal,
        s.rating_avg as ratingAvg, s.rating_count as ratingCount, s.rating_sum as ratingSum,
        s.category_id,
        c.parent_id as cat_parent_id,
        u.name as authorName,
        (SELECT COUNT(*) FROM cards WHERE set_id = s.id AND deleted = 0) as cardCount,
        (SELECT stars FROM set_ratings WHERE set_root_id = s.id AND user_id = ?) as yourStars,
        (SELECT 1 FROM sets my WHERE my.origin_set_id = s.id AND my.user_id = ? AND my.deleted = 0 LIMIT 1) as added
      FROM sets s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN categories c ON s.category_id = c.id
      WHERE s.is_global = 1 AND s.is_hidden = 0 AND s.deleted = 0 AND s.user_id != ?
    `;
    const args: any[] = [userId, userId, userId];
    
    if (q) {
      query += ` AND (LOWER(s.title) LIKE ? OR s.id IN (SELECT set_id FROM cards WHERE LOWER(front) LIKE ? OR LOWER(back) LIKE ?))`;
      args.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    
    const rawSets = await all<any>(db, query, args);
    
    const interests = await all<{ category_id: string; weight: number }>(db, "SELECT category_id, weight FROM user_interests WHERE user_id = ?", [userId]);
    const weightMap = new Map(interests.map(i => [i.category_id, i.weight]));
    
    const userSets = await all<{ title: string; category_id: string; reviews: number }>(db, `
      SELECT s.title, s.category_id,
        (SELECT COUNT(*) FROM review_log r JOIN cards c ON r.card_id = c.id WHERE c.set_id = s.id AND r.reviewed_at >= datetime('now', '-30 days')) as reviews
      FROM sets s
      WHERE s.user_id = ? AND s.deleted = 0 AND s.category_id IS NOT NULL
    `, [userId]);
    
    const C = 20;
    const m = globalMeanRating;
    
    const scoredSets = rawSets.map(s => {
      const r_sum = s.ratingSum || 0;
      const r_count = s.ratingCount || 0;
      const score_rating = (C * m + r_sum) / (C + r_count);
      
      let interest = 0;
      if (tab === "for") {
        const w_self = weightMap.get(s.category_id) || 0;
        const w_parent = weightMap.get(s.cat_parent_id) || 0;
        interest = Math.max(0.05, w_self + 0.5 * w_parent);
      }
      
      const score = tab === "for" ? interest * score_rating : score_rating;
      
      let reasonSetTitle = null;
      if (tab === "for" || tab === "top" || tab === "new") {
        let best = -1;
        for (const us of userSets) {
          if (us.category_id === s.category_id || (s.cat_parent_id && us.category_id === s.cat_parent_id)) {
            if (us.reviews > best) {
              best = us.reviews;
              reasonSetTitle = us.title;
            }
          }
        }
        if (tab !== "for" && !reasonSetTitle) {
          reasonSetTitle = undefined;
        }
      }
      
      return { ...s, score, score_rating, interest, reasonSetTitle };
    });
    
    let finalTab = tab;
    if (tab === "for" && interests.length === 0) {
      finalTab = "top";
    }
    
    if (finalTab === "top") {
      scoredSets.forEach(s => { if (s.ratingCount < 3) s.score = -1; });
      scoredSets.sort((a, b) => b.score - a.score);
    } else if (finalTab === "new") {
      scoredSets.sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());
    } else {
      scoredSets.sort((a, b) => {
        if (Math.abs(b.score - a.score) > 0.0001) return b.score - a.score;
        return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
      });
    }
    
    let validSets = scoredSets;
    if (finalTab === "top") validSets = scoredSets.filter(s => s.score !== -1);
    
    let diverseSets = [];
    if (finalTab === "for") {
      const windowCats: string[] = [];
      for (const s of validSets) {
        const recent10 = windowCats.slice(-9);
        const count = recent10.filter(c => c === s.category_id).length;
        if (count < 3) {
          diverseSets.push(s);
          windowCats.push(s.category_id);
        }
      }
    } else {
      diverseSets = validSets;
    }
    
    const page = diverseSets.slice(cursor, cursor + 20);
    const nextCursor = cursor + 20 < diverseSets.length ? cursor + 20 : null;
    
    const result = page.map(s => ({
      id: s.id,
      title: s.title,
      description: s.description,
      source: s.source,
      sourceLabel: s.sourceLabel,
      published_at: s.published_at,
      isGlobal: !!s.isGlobal,
      ratingAvg: s.ratingAvg,
      ratingCount: s.ratingCount,
      yourStars: s.yourStars,
      added: !!s.added,
      authorName: s.authorName || "Anonymous",
      cardCount: s.cardCount,
      reasonSetTitle: s.reasonSetTitle
    }));
    
    const data = { sets: result, nextCursor };
    cache.set(cacheKey, { version: catalogueVersion, expires: Date.now() + 10 * 60 * 1000, data });
    
    return c.json(data);
  });

  app.post("/:id/add", async (c) => {
    const userId = c.get("userId");
    const rootId = c.req.param("id");
    
    const existing = await all<{ id: string }>(db, "SELECT id FROM sets WHERE origin_set_id = ? AND user_id = ? AND deleted = 0", [rootId, userId]);
    if (existing.length > 0) return c.json({ id: existing[0].id });
    
    const rootSet = await one<any>(db, "SELECT * FROM sets WHERE id = ? AND is_global = 1 AND deleted = 0", [rootId]);
    if (!rootSet) return c.json({ error: "not_found" }, 404);
    
    const newSetId = randomUUID();
    const now = new Date().toISOString();
    
    // NOTE: run DOES NOT EXIST. Use execute from db.ts! Wait! run DOES exist, we exported it!
    // Wait, let's use run from db.ts! But we also have db.batch. I will use run for simplicity.
    await run(db, 
      "INSERT INTO sets (id, user_id, title, description, source, source_label, mode, created_at, updated_at, origin_set_id, category_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [newSetId, userId, rootSet.title, rootSet.description, rootSet.source, rootSet.source_label, rootSet.mode, now, now, rootId, rootSet.category_id]
    );
    
    const cards = await all<any>(db, "SELECT * FROM cards WHERE set_id = ? AND deleted = 0", [rootId]);
    for (const card of cards) {
      await run(db, 
        "INSERT INTO cards (id, set_id, user_id, front, back, created_at, updated_at, easiness, interval, repetitions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [randomUUID(), newSetId, userId, card.front, card.back, now, now, 2.5, 0, 0]
      );
    }
    
    return c.json({ id: newSetId });
  });

  app.get("/:id/preview", async (c) => {
    const rootId = c.req.param("id");
    const cards = await all<any>(db, "SELECT front, back FROM cards WHERE set_id = ? AND deleted = 0 LIMIT 3", [rootId]);
    return c.json({ cards });
  });

  return app;
}
