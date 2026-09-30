import { describe, it, expect, beforeEach } from "vitest";
import { openDB, migrate, type DB, run, one } from "../src/db.js";
import { createApp } from "../src/app.js";
import { register, signAccessToken } from "../src/auth.js";

let db: DB;
let app: ReturnType<typeof createApp>;
let t1: string;
let t2: string;

describe("Ratings API", () => {
  beforeEach(async () => {
    db = openDB(":memory:");
    await migrate(db);
    app = createApp(db);

    const u1 = await register(db, "u1@t.com", "pw", "User 1");
    const u2 = await register(db, "u2@t.com", "pw", "User 2");
    t1 = await signAccessToken(u1.id);
    t2 = await signAccessToken(u2.id);

    await run(db, "INSERT INTO sets (id, user_id, title, is_global, created_at, updated_at) VALUES (?, ?, ?, 0, '2026-01-01', '2026-01-01')", ["set1", u1.id, "Private Set 1"]);
    await run(db, "INSERT INTO sets (id, user_id, title, is_global, created_at, updated_at) VALUES (?, ?, ?, 1, '2026-01-01', '2026-01-01')", ["set2", u1.id, "Global Set 1"]);
    await run(db, "INSERT INTO sets (id, user_id, title, is_global, origin_set_id, created_at, updated_at) VALUES (?, ?, ?, 0, ?, '2026-01-01', '2026-01-01')", ["copy1", u2.id, "Copy of Global", "set2"]);
  });

  const req = async (method: string, path: string, token: string, body?: any) => {
    const res = await app.request("http://localhost" + path, {
      method,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: body ? JSON.stringify(body) : undefined
    });
    return {
      status: res.status,
      body: await res.json().catch(() => ({}))
    };
  };

  it("private ratings aren't public, publishing makes the owner's rating count 1", async () => {
    const r1 = await req("PUT", "/v1/sets/set1/rating", t1, { stars: 5 });
    expect(r1.status).toBe(200);
    expect(r1.body.yourStars).toBe(5);
    expect(r1.body.count).toBe(1);
    expect(r1.body.avg).toBe(5);

    const l1 = await req("POST", "/v1/ratings/lookup", t1, { ids: ["set1"] });
    expect(l1.body.set1.ratingCount).toBe(1);
    
    await run(db, "UPDATE sets SET is_global = 1 WHERE id = 'set1'");
    const s = await one<any>(db, "SELECT rating_count FROM sets WHERE id = 'set1'");
    expect(s?.rating_count).toBe(1);
  });

  it("copies write to the root, upsert, change and clear update the aggregates in one transaction", async () => {
    const r1 = await req("PUT", "/v1/sets/copy1/rating", t2, { stars: 4 });
    expect(r1.status).toBe(200);
    expect(r1.body.yourStars).toBe(4);
    expect(r1.body.count).toBe(1);
    expect(r1.body.avg).toBe(4);

    const root = await one<any>(db, "SELECT rating_avg, rating_count, rating_sum FROM sets WHERE id = 'set2'");
    expect(root?.rating_count).toBe(1);
    expect(root?.rating_avg).toBe(4);

    const r2 = await req("PUT", "/v1/sets/copy1/rating", t2, { stars: 2 });
    expect(r2.body.avg).toBe(2);

    const r3 = await req("PUT", "/v1/sets/set2/rating", t1, { stars: 4 });
    expect(r3.body.avg).toBe(3);
    expect(r3.body.count).toBe(2);

    const c1 = await req("DELETE", "/v1/sets/copy1/rating", t2);
    expect(c1.body.count).toBe(1);
    expect(c1.body.avg).toBe(4);
  });

  it("ownership is checked", async () => {
    const r1 = await req("PUT", "/v1/sets/set1/rating", t2, { stars: 5 });
    expect(r1.status).toBe(404);
  });

  it("zod rejects bad values", async () => {
    const bad = [0, 6, 2.5, "5", null];
    for (const stars of bad) {
      const r = await req("PUT", "/v1/sets/set1/rating", t1, { stars });
      expect(r.status).toBe(400);
    }
  });

  it("deleting a copy removes its vote", async () => {
    await req("PUT", "/v1/sets/copy1/rating", t2, { stars: 5 });
    
    const syncRes = await req("POST", "/v1/sync", t2, {
      sets: [{ id: "copy1", title: "Copy of Global", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z", deleted: true, originSetId: "set2" }],
      cards: [], quiz: [], activity: [], reviews: []
    });
    console.log("SYNC RESPONSE:", syncRes); const ratings = await (await import("../src/db.js")).all(db, "SELECT * FROM set_ratings"); console.log("RATINGS_DB:", ratings);
    
    const root = await one<any>(db, "SELECT rating_count FROM sets WHERE id = 'set2'");
    expect(root?.rating_count).toBe(0);
  });
});
