import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openDB, migrate, MIGRATIONS, type DB, run, one } from "../src/db.js";
import { createApp } from "../src/app.js";
import { register, signAccessToken } from "../src/auth.js";

// Two suites: both branches that built ratings (redesign 07 and 09) wrote one.
// They're kept side by side because each pins cases the other doesn't.

describe("Ratings API (publish and copies)", () => {
  let db: DB;
  let app: ReturnType<typeof createApp>;
  let t1: string;
  let t2: string;
  let t3: string;

  beforeEach(async () => {
    db = openDB(":memory:");
    await migrate(db);
    app = createApp(db);

    const u1 = await register(db, "u1@t.com", "password1", "User 1");
    const u2 = await register(db, "u2@t.com", "password2", "User 2");
    const u3 = await register(db, "u3@t.com", "password3", "User 3");
    t1 = await signAccessToken(u1.id);
    t2 = await signAccessToken(u2.id);
    t3 = await signAccessToken(u3.id);

    await run(db, "INSERT INTO sets (id, user_id, title, is_global, created_at, updated_at) VALUES (?, ?, ?, 0, '2026-01-01', '2026-01-01')", ["set1", u1.id, "Private Set 1"]);
    await run(db, "INSERT INTO sets (id, user_id, title, is_global, created_at, updated_at) VALUES (?, ?, ?, 1, '2026-01-01', '2026-01-01')", ["set2", u1.id, "Global Set 1"]);
    // Copies of u1's global set, made by two other learners.
    await run(db, "INSERT INTO sets (id, user_id, title, is_global, origin_set_id, created_at, updated_at) VALUES (?, ?, ?, 0, ?, '2026-01-01', '2026-01-01')", ["copy1", u2.id, "Copy of Global", "set2"]);
    await run(db, "INSERT INTO sets (id, user_id, title, is_global, origin_set_id, created_at, updated_at) VALUES (?, ?, ?, 0, ?, '2026-01-01', '2026-01-01')", ["copy3", u3.id, "Copy of Global", "set2"]);
  });

  const req = async (method: string, path: string, token: string, body?: any) => {
    const res = await app.request("http://localhost" + path, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };

  // Rating is for global sets, by someone who didn't make them. (An earlier
  // rule let anyone rate any set of their own; the creator's own vote only
  // inflated the average.)
  it("you can't rate a set you made, private or global", async () => {
    for (const id of ["set1", "set2"]) {
      const r = await req("PUT", `/v1/sets/${id}/rating`, t1, { stars: 5 });
      expect(r.status).toBe(403);
      expect(r.body.error).toBe("own_set");
      expect(r.body.message).toMatch(/set you made/i);
    }
    const s = await one<any>(db, "SELECT rating_count FROM sets WHERE id = 'set2'");
    expect(s?.rating_count).toBe(0);
    expect(Number((await one<any>(db, "SELECT COUNT(*) AS n FROM set_ratings"))?.n)).toBe(0);
  });

  it("a copy of a set that isn't global can't be rated", async () => {
    await run(db, "UPDATE sets SET is_global = 0 WHERE id = 'set2'");
    const r = await req("PUT", "/v1/sets/copy1/rating", t2, { stars: 4 });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe("not_global");
  });

  it("a copy whose original was deleted can't be rated", async () => {
    await run(db, "UPDATE sets SET deleted = 1 WHERE id = 'set2'");
    const r = await req("PUT", "/v1/sets/copy1/rating", t2, { stars: 4 });
    expect(r.status).toBe(404);
  });

  it("a copy of your own set is still your own set", async () => {
    await run(db, "INSERT INTO sets (id, user_id, title, is_global, origin_set_id, created_at, updated_at) SELECT 'selfcopy', user_id, 'Mine again', 0, 'set2', '2026-01-01', '2026-01-01' FROM sets WHERE id = 'set2'");
    const r = await req("PUT", "/v1/sets/selfcopy/rating", t1, { stars: 5 });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe("own_set");
  });

  it("a rating left over from the old rule can still be cleared", async () => {
    await run(db, "INSERT INTO set_ratings (set_root_id, user_id, stars, created_at, updated_at) SELECT 'set1', user_id, 5, '2026-01-01', '2026-01-01' FROM sets WHERE id = 'set1'");
    const r = await req("DELETE", "/v1/sets/set1/rating", t1);
    expect(r.status).toBe(200);
    expect(r.body.yourStars).toBeNull();
    expect(Number((await one<any>(db, "SELECT COUNT(*) AS n FROM set_ratings"))?.n)).toBe(0);
  });

  it("copies write to the root, upsert, change and clear update the aggregates", async () => {
    const r1 = await req("PUT", "/v1/sets/copy1/rating", t2, { stars: 4 });
    expect(r1.status).toBe(200);
    expect(r1.body).toEqual({ yourStars: 4, avg: 4, count: 1 });

    const root = await one<any>(db, "SELECT rating_avg, rating_count FROM sets WHERE id = 'set2'");
    expect(root?.rating_count).toBe(1);
    expect(root?.rating_avg).toBe(4);

    const r2 = await req("PUT", "/v1/sets/copy1/rating", t2, { stars: 2 });
    expect(r2.body.avg).toBe(2);

    // A second learner's vote counts toward the same root.
    const r3 = await req("PUT", "/v1/sets/copy3/rating", t3, { stars: 4 });
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

  it("lookup answers by root id for a copy, and not for a set you neither own nor copied", async () => {
    await req("PUT", "/v1/sets/copy1/rating", t2, { stars: 4 });
    const mine = await req("POST", "/v1/ratings/lookup", t2, { ids: ["set2", "set1"] });
    expect(mine.body.set2).toEqual({ yourStars: 4, ratingAvg: 4, ratingCount: 1, isGlobal: true });
    expect(mine.body.set1).toBeUndefined();
  });

  it("Discover and admin routes need a token", async () => {
    for (const path of ["/v1/discover?tab=new", "/v1/admin/reports"]) {
      const res = await app.request("http://localhost" + path);
      expect(res.status).toBe(401);
    }
  });

  it("rejects bad values", async () => {
    for (const stars of [0, 6, 2.5, "5", null]) {
      const r = await req("PUT", "/v1/sets/set1/rating", t1, { stars });
      expect(r.status).toBe(400);
    }
  });

  it("deleting a copy removes its vote", async () => {
    await req("PUT", "/v1/sets/copy1/rating", t2, { stars: 5 });
    await req("POST", "/v1/sync", t2, {
      sets: [{ id: "copy1", title: "Copy of Global", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z", deleted: true, originSetId: "set2" }],
      cards: [], quiz: [], activity: [], reviews: [],
    });
    const root = await one<any>(db, "SELECT rating_count FROM sets WHERE id = 'set2'");
    expect(root?.rating_count).toBe(0);
  });

  it("a client can't make its own set global through sync", async () => {
    await req("POST", "/v1/sync", t1, {
      sets: [{ id: "sneaky", title: "Mine", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z", isGlobal: true }],
      cards: [], quiz: [], activity: [], reviews: [],
    });
    const row = await one<any>(db, "SELECT is_global FROM sets WHERE id = 'sneaky'");
    expect(Number(row?.is_global)).toBe(0);
  });
});

describe("Ratings API (aggregates and lookup)", () => {
  let db: DB;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    db = openDB(":memory:");
    app = createApp(db);
    await migrate(db);
    await run(db, "INSERT INTO users (id, email, password_hash, created_at) VALUES ('u1', 'a@b.com', 'x', '2024')");
    await run(db, "INSERT INTO users (id, email, password_hash, created_at) VALUES ('u2', 'b@b.com', 'x', '2024')");
    await run(db, "INSERT INTO users (id, email, password_hash, created_at) VALUES ('u3', 'c@b.com', 'x', '2024')");
  });

  afterEach(() => {
    db.close();
  });

  // A global set by u1, as the ratings apply only to global sets.
  const globalRoot = (id: string) =>
    run(db, "INSERT INTO sets (id, user_id, title, is_global, created_at, updated_at) VALUES (?, 'u1', 'title', 1, '2024', '2024')", [id]);

  async function mockReq(method: string, path: string, userId: string, body?: any) {
    const token = await signAccessToken(userId);
    return app.request(path, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  it("upsert, change and clear update the aggregates in one batch", async () => {
    await globalRoot("s1");
    await run(db, "INSERT INTO sets (id, user_id, origin_set_id, title, created_at, updated_at) VALUES ('s2', 'u2', 's1', 'title', '2024', '2024')");
    await run(db, "INSERT INTO sets (id, user_id, origin_set_id, title, created_at, updated_at) VALUES ('s3', 'u3', 's1', 'title', '2024', '2024')");

    const r1 = await mockReq("PUT", "/v1/sets/s2/rating", "u2", { stars: 4 });
    expect(r1.status).toBe(200);
    expect(await r1.json()).toEqual({ yourStars: 4, avg: 4, count: 1 });

    const r2 = await mockReq("PUT", "/v1/sets/s2/rating", "u2", { stars: 5 });
    expect(await r2.json()).toEqual({ yourStars: 5, avg: 5, count: 1 });

    const r3 = await mockReq("PUT", "/v1/sets/s3/rating", "u3", { stars: 1 });
    expect(await r3.json()).toEqual({ yourStars: 1, avg: 3, count: 2 });

    const r4 = await mockReq("DELETE", "/v1/sets/s3/rating", "u3");
    expect(await r4.json()).toEqual({ yourStars: null, avg: 5, count: 1 });
  });

  it("copies write to the root", async () => {
    await globalRoot("root1");
    await run(db, "INSERT INTO sets (id, origin_set_id, user_id, title, created_at, updated_at) VALUES ('copy1', 'root1', 'u2', 'title', '2024', '2024')");

    const res = await mockReq("PUT", "/v1/sets/copy1/rating", "u2", { stars: 4 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ yourStars: 4, avg: 4, count: 1 });

    const row = await one(db, "SELECT rating_avg FROM sets WHERE id = 'root1'");
    expect(row?.rating_avg).toBe(4);
    const copy = await one(db, "SELECT rating_avg FROM sets WHERE id = 'copy1'");
    expect(copy?.rating_avg).toBeNull();
  });

  it("ownership is checked", async () => {
    await run(db, "INSERT INTO sets (id, user_id, title, created_at, updated_at) VALUES ('s1', 'u1', 'title', '2024', '2024')");
    const res = await mockReq("PUT", "/v1/sets/s1/rating", "u2", { stars: 4 });
    expect(res.status).toBe(404);
  });

  it("rejects bad values", async () => {
    await run(db, "INSERT INTO sets (id, user_id, title, created_at, updated_at) VALUES ('s1', 'u1', 't', '1', '1')");
    for (const stars of [0, 6, 2.5]) {
      const r = await mockReq("PUT", "/v1/sets/s1/rating", "u1", { stars });
      expect(r.status).toBe(400);
    }
  });

  it("lookup returns fresh aggregates", async () => {
    await globalRoot("s1");
    await run(db, "INSERT INTO sets (id, user_id, origin_set_id, title, created_at, updated_at) VALUES ('c1', 'u2', 's1', 't', '1', '1')");
    await mockReq("PUT", "/v1/sets/c1/rating", "u2", { stars: 4 });

    const res = await mockReq("POST", "/v1/ratings/lookup", "u2", { ids: ["s1"] });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.s1).toEqual({ yourStars: 4, ratingAvg: 4, ratingCount: 1, isGlobal: true });

    // The author sees the same aggregate, and never a vote of their own.
    const mine = (await (await mockReq("POST", "/v1/ratings/lookup", "u1", { ids: ["s1"] })).json()) as Record<string, any>;
    expect(mine.s1).toEqual({ yourStars: null, ratingAvg: 4, ratingCount: 1, isGlobal: true });
  });

  it("a private set of yours has no rating at all", async () => {
    await run(db, "INSERT INTO sets (id, user_id, title, created_at, updated_at) VALUES ('p1', 'u1', 't', '1', '1')");
    const res = await mockReq("PUT", "/v1/sets/p1/rating", "u1", { stars: 4 });
    expect(res.status).toBe(403);
    const body = (await (await mockReq("POST", "/v1/ratings/lookup", "u1", { ids: ["p1"] })).json()) as Record<string, any>;
    expect(body.p1).toEqual({ yourStars: null, ratingAvg: null, ratingCount: 0, isGlobal: false });
  });

  it("lookup refuses more than 200 ids", async () => {
    const res = await mockReq("POST", "/v1/ratings/lookup", "u1", { ids: Array.from({ length: 201 }, (_, i) => "s" + i) });
    expect(res.status).toBe(400);
  });

  it("a client can't push aggregates through sync", async () => {
    const res = await mockReq("POST", "/v1/sync", "u1", {
      sets: [{ id: "s1", title: "t", mode: "general", createdAt: "1", updatedAt: "1", ratingAvg: 5, ratingCount: 100 }],
      cards: [], quiz: [],
    });
    expect(res.status).toBe(200);
    const row = await one(db, "SELECT rating_avg, rating_count FROM sets WHERE id = 's1'");
    expect(row?.rating_avg).toBeNull();
    expect(row?.rating_count).toBe(0);
  });
});

// Ratings by a set's own author were allowed once, and they count toward the
// average everyone sees. Migration 022 removes them and recomputes.
describe("migration 022: drop self-ratings", () => {
  it("removes an author's own votes, keeps everyone else's, and recomputes the aggregates", async () => {
    const db = openDB(":memory:");
    await migrate(db);
    for (const u of ["a", "b", "c"]) await run(db, "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, 'x', '2024')", [u, `${u}@t.com`]);
    // a's global set, rated by a (their own), b and c; a's private set, rated by a.
    await run(db, "INSERT INTO sets (id, user_id, title, is_global, created_at, updated_at, rating_count, rating_sum, rating_avg) VALUES ('g1', 'a', 't', 1, '1', '1', 3, 11, 11.0/3)");
    await run(db, "INSERT INTO sets (id, user_id, title, is_global, created_at, updated_at, rating_count, rating_sum, rating_avg) VALUES ('p1', 'a', 't', 0, '1', '1', 1, 5, 5)");
    for (const [root, user, stars] of [["g1", "a", 5], ["g1", "b", 4], ["g1", "c", 2], ["p1", "a", 5]] as const) {
      await run(db, "INSERT INTO set_ratings (set_root_id, user_id, stars, created_at, updated_at) VALUES (?, ?, ?, '1', '1')", [root, user, stars]);
    }

    const sql = MIGRATIONS[21];
    expect(sql, "migration 022 must exist").toBeTruthy();
    for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) await db.execute(stmt);

    const left = await db.execute("SELECT set_root_id, user_id FROM set_ratings ORDER BY set_root_id, user_id");
    expect(left.rows.map((r) => `${r.set_root_id}:${r.user_id}`)).toEqual(["g1:b", "g1:c"]);
    const g = await one<any>(db, "SELECT rating_count, rating_sum, rating_avg FROM sets WHERE id = 'g1'");
    expect(Number(g?.rating_count)).toBe(2);
    expect(Number(g?.rating_sum)).toBe(6);
    expect(g?.rating_avg).toBe(3);
    const p = await one<any>(db, "SELECT rating_count, rating_sum, rating_avg FROM sets WHERE id = 'p1'");
    expect(Number(p?.rating_count)).toBe(0);
    expect(p?.rating_avg).toBeNull();
    db.close();
  });
});
