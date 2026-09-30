import { run, all, one, DB } from "./db.js";
import { callJson, LLMError } from "./llm.js";
import { randomUUID } from "node:crypto";

let categoryWorkerTimer: NodeJS.Timeout | null = null;
let isRunning = false;
let pauseUntil = 0;
// "A learner's generation always goes first: if a generation ran in the last 10s, skip this tick."
// We can track the last generation time globally, but `llm.ts` handles generations. Let's just track it here by exporting a function that `llm.ts` calls? 
// Or we can query `generation_events`! Wait, we don't have generation_events in prompt 08, wait... prompt 34 had a billing table? Yes, `generation_events` exists in `db.ts`!
// "if a generation ran in the last 10s, skip this tick. Use the existing provider client and LLMError. No new provider."

export async function runCategoryWorker(db: DB) {
  if (isRunning) return;
  isRunning = true;
  try {
    const now = Date.now();
    if (now < pauseUntil) return;

    // Check generation_events in the last 10s
    // actually, generation_events might not track ALL generations? It's for billing.
    // Let's just check the last created_at in generation_events.
    const lastGen = await one<{ created_at: string }>(
      db,
      "SELECT created_at FROM generation_events ORDER BY created_at DESC LIMIT 1"
    );
    if (lastGen) {
      const msSince = now - new Date(lastGen.created_at).getTime();
      if (msSince < 10000) return; // Skip this tick
    }

    // Pick oldest stale or uncategorised sets.
    // Wait, categorised_at is NULL for uncategorised.
    // category_stale = 1 for stale.
    // Also we should check sets that aren't global copies, but global copies inherit directly (already done in sync.ts).
    const staleSet = await one<{ id: string; title: string; category_stale: number; categorised_at: string | null }>(
      db,
      `SELECT id, title, category_stale, categorised_at 
       FROM sets 
       WHERE deleted = 0 AND (category_stale = 1 OR categorised_at IS NULL)
       ORDER BY COALESCE(categorised_at, '1970-01-01T00:00:00Z') ASC LIMIT 1`
    );

    if (!staleSet) return;

    await categorizeSet(db, staleSet.id);

  } catch (e: any) {
    if (e instanceof LLMError && e.status === 429) {
      pauseUntil = Date.now() + 5 * 60 * 1000;
    }
    console.error("Category worker error:", e);
  } finally {
    isRunning = false;
  }
}

export function startCategoryWorker(db: DB) {
  if (!categoryWorkerTimer) {
    categoryWorkerTimer = setInterval(() => runCategoryWorker(db), 30000);
  }
}

async function categorizeSet(db: DB, setId: string) {
  // Fetch up to 20 Q/A pairs.
  const cards = await all<{ front: string; back: string }>(
    db, "SELECT front, back FROM cards WHERE set_id = ? AND deleted = 0 LIMIT 20", [setId]
  );
  const setRow = await one<{ title: string; source: string | null; is_global: number }>(
    db, "SELECT title, source, is_global FROM sets WHERE id = ?", [setId]
  );
  if (!setRow) return;

  const cats = await all<{ id: string; slug: string; name: string; parent_id: string | null }>(
    db, "SELECT id, slug, name, parent_id FROM categories"
  );

  const tree = cats.map(c => {
    let path = c.name;
    if (c.parent_id) {
      const parent = cats.find(p => p.id === c.parent_id);
      if (parent) path = `${parent.name} > ${c.name}`;
    }
    return { id: c.id, path };
  });

  // Limit input to ~2000 tokens (approx 8000 chars)
  let pairs = "";
  for (const c of cards) {
    const pair = `Q: ${c.front}\nA: ${c.back}\n\n`;
    if (pairs.length + pair.length > 6000) break;
    pairs += pair;
  }

  const system = `You classify flashcard sets into categories based on their actual topic/subject matter (e.g., 'Networking', 'Java', 'Cardiology').
DO NOT use the source application (like 'YouTube', 'ChatGPT', or 'AI Studio') as the category.

Current category list:
${JSON.stringify(tree)}

Instructions:
1. Return JSON in this format: { "category_id": "<existing id>" | null, "new_category": { "name": "...", "parent_id": "..." } | null, "confidence": 0-1 }
2. Prefer existing categories. Only create a new one if confidence for ALL existing categories is below 0.5.
3. 'new_category.parent_id' must be a top-level existing seed category id, or null.
4. 'new_category.name' must be plain text, max 40 chars.
5. If confidence is 0 or you cannot classify it, return category_id for 'Other' ('cat_oth').`;

  const user = `Title: ${setRow.title}\n\nCards:\n${pairs}`;

  let attempts = 0;
  let success = false;
  let finalResult: any = null;

  while (attempts < 3 && !success) {
    attempts++;
    try {
      const res = await callJson(system, user, 80);
      finalResult = res;
      
      // Validate
      if (res.category_id) {
        if (!cats.find(c => c.id === res.category_id)) throw new Error("Unknown category_id");
      }
      if (res.new_category) {
        if (typeof res.new_category.name !== "string" || res.new_category.name.length > 40) {
          throw new Error("Invalid new_category name");
        }
        if (res.new_category.parent_id) {
          const p = cats.find(c => c.id === res.new_category.parent_id);
          if (!p || p.parent_id !== null) throw new Error("Invalid new_category parent_id");
        }
      }
      
      success = true;
    } catch (e: any) {
      if (e instanceof LLMError && e.status === 429) {
        throw e; // Bubble up 429 to trigger pause
      }
      if (attempts === 3) {
        finalResult = { category_id: "cat_oth", confidence: 0 };
        success = true; // Fallback
      } else {
        // Backoff
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempts)));
      }
    }
  }

  // Handle result in a transaction
  const tx = await db.transaction("write");
  try {
    let catId = finalResult.category_id;
    let conf = finalResult.confidence;

    // Daily cap of 20 new categories
    if (!catId && finalResult.new_category) {
      const today = new Date().toISOString().split("T")[0];
      const newCount = (await all(tx, "SELECT id FROM categories WHERE created_by = 'ai' AND created_at >= ?", [today])).length;
      if (newCount >= 20) {
        catId = "cat_oth";
        conf = 0;
      } else {
        catId = "cat_" + randomUUID().substring(0, 8);
        const slug = finalResult.new_category.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        await run(tx, "INSERT INTO categories (id, slug, name, parent_id, created_at, created_by) VALUES (?, ?, ?, ?, ?, 'ai')",
          [catId, slug, finalResult.new_category.name, finalResult.new_category.parent_id || null, new Date().toISOString()]);
      }
    }

    if (!catId) catId = "cat_oth";

    const totalCards = (await one<{ c: number }>(tx, "SELECT COUNT(*) as c FROM cards WHERE set_id = ? AND deleted = 0", [setId]))!.c;
    await run(tx, "UPDATE sets SET category_id = ?, category_confidence = ?, category_model = 'llm', categorised_at = ?, categorised_card_count = ?, category_stale = 0 WHERE id = ?",
      [catId, conf, new Date().toISOString(), totalCards, setId]);
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

// User interests background task
export async function runInterestsWorker(db: DB) {
  try {
    const lastRun = await one<{ applied_at: string }>(db, "SELECT applied_at FROM migrations WHERE name = 'interests_last_run'");
    const now = Date.now();
    if (lastRun) {
      if (now - new Date(lastRun.applied_at).getTime() < 24 * 60 * 60 * 1000) return;
      await run(db, "UPDATE migrations SET applied_at = ? WHERE name = 'interests_last_run'", [new Date().toISOString()]);
    } else {
      await run(db, "INSERT INTO migrations (name, applied_at) VALUES ('interests_last_run', ?)", [new Date().toISOString()]);
    }

    const users = await all<{ id: string }>(db, "SELECT id FROM users LIMIT 200"); // Batch 200
    for (const u of users) {
      await computeInterests(db, u.id);
    }
  } catch (e) {
    console.error("Interests worker error:", e);
  }
}

export async function computeInterests(db: DB, userId: string) {
  // Recompute weights
  // weight = sum over sets in category: (reviews in last 30d + 5 if created/added in last 30d)
  // * 0.5^(days_since_last_activity / 30)
  
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  
  const sets = await all<{ id: string; category_id: string; created_at: string }>(
    db, "SELECT id, category_id, created_at FROM sets WHERE user_id = ? AND deleted = 0 AND category_id IS NOT NULL", [userId]
  );
  
  const cats = await all<{ id: string; parent_id: string | null }>(db, "SELECT id, parent_id FROM categories");
  
  const catWeights = new Map<string, number>();
  const catLastActivity = new Map<string, number>();
  
  for (const s of sets) {
    let weight = 0;
    let lastAct = new Date(s.created_at).getTime();
    
    if (s.created_at >= thirtyDaysAgo) weight += 5;
    
    const reviews = await all<{ reviewed_at: string }>(
      db, "SELECT reviewed_at FROM review_log WHERE user_id = ? AND card_id IN (SELECT id FROM cards WHERE set_id = ?) AND reviewed_at >= ?",
      [userId, s.id, thirtyDaysAgo]
    );
    
    weight += reviews.length;
    
    for (const r of reviews) {
      const rt = new Date(r.reviewed_at).getTime();
      if (rt > lastAct) lastAct = rt;
    }
    
    if (weight > 0) {
      const daysSince = (Date.now() - lastAct) / (24 * 60 * 60 * 1000);
      const decayed = weight * Math.pow(0.5, daysSince / 30);
      
      catWeights.set(s.category_id, (catWeights.get(s.category_id) || 0) + decayed);
      
      const currentLast = catLastActivity.get(s.category_id) || 0;
      if (lastAct > currentLast) catLastActivity.set(s.category_id, lastAct);
    }
  }
  
  // Apply 50% to parents
  const finalWeights = new Map<string, number>();
  for (const [cid, w] of catWeights.entries()) {
    finalWeights.set(cid, (finalWeights.get(cid) || 0) + w);
    const parent = cats.find(c => c.id === cid)?.parent_id;
    if (parent) {
      finalWeights.set(parent, (finalWeights.get(parent) || 0) + w * 0.5);
    }
  }
  
  // Normalize
  let sum = 0;
  for (const w of finalWeights.values()) sum += w;
  
  const tx = await db.transaction("write");
  try {
    await run(tx, "DELETE FROM user_interests WHERE user_id = ?", [userId]);
    if (sum > 0) {
      const now = new Date().toISOString();
      for (const [cid, w] of finalWeights.entries()) {
        await run(tx, "INSERT INTO user_interests (user_id, category_id, weight, updated_at) VALUES (?, ?, ?, ?)",
          [userId, cid, w / sum, now]);
      }
    }
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

export function resetCategoriesForTest() { pauseUntil = 0; isRunning = false; }
