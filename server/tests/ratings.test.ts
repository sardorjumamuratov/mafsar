import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DB, migrate } from "../src/db.js";
import { run, one } from "../src/db.js";
import { openDB } from "../src/db.js";
import { createApp } from "../src/app.js";

describe("ratings API", () => {
  let db: DB;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    db = openDB(":memory:");
    app = createApp(db);
    await migrate(db);
    // seed users
    await run(db, "INSERT INTO users (id, email, password_hash, created_at) VALUES ('u1', 'a@b.com', 'x', '2024')");
    await run(db, "INSERT INTO users (id, email, password_hash, created_at) VALUES ('u2', 'b@b.com', 'x', '2024')");
  });

  afterEach(() => {
    db.close();
  });

  async function mockReq(method: string, path: string, userId: string, body?: any) {
    const init: RequestInit = {
      method,
      headers: { "Content-Type": "application/json" }
    };
    if (body) init.body = JSON.stringify(body);
    const { signAccessToken } = await import("../src/auth.js");
    const token = await signAccessToken(userId);
    return app.request(path, {
      method,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
      body: init.body
    });
  }

  it("upsert, change and clear update the aggregates in one transaction", async () => {
    await run(db, "INSERT INTO sets (id, user_id, title, created_at, updated_at) VALUES ('s1', 'u1', 'title', '2024', '2024')");
    
    // Upsert
    const r1 = await mockReq("PUT", "/v1/sets/s1/rating", "u1", { stars: 4 });
    console.log("R1 status", r1.status);
    console.log("R1 body", await r1.clone().text());
    expect(r1.status).toBe(200);
    expect(await r1.json()).toEqual({ yourStars: 4, avg: 4, count: 1 });
    
    // Change
    const r2 = await mockReq("PUT", "/v1/sets/s1/rating", "u1", { stars: 5 });
    expect(await r2.json()).toEqual({ yourStars: 5, avg: 5, count: 1 });
    
    // Another user rates via their copy
    await run(db, "INSERT INTO sets (id, user_id, origin_set_id, title, created_at, updated_at) VALUES ('s2', 'u2', 's1', 'title', '2024', '2024')");
    const r3 = await mockReq("PUT", "/v1/sets/s2/rating", "u2", { stars: 1 });
    expect(await r3.json()).toEqual({ yourStars: 1, avg: 3, count: 2 });
    
    // Clear
    const r4 = await mockReq("DELETE", "/v1/sets/s2/rating", "u2");
    expect(await r4.json()).toEqual({ yourStars: null, avg: 5, count: 1 });
  });

  it("copies write to the root", async () => {
    await run(db, "INSERT INTO sets (id, user_id, title, created_at, updated_at) VALUES ('root1', 'u1', 'title', '2024', '2024')");
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

  it("zod rejects bad values", async () => {
    await run(db, "INSERT INTO sets (id, user_id, title, created_at, updated_at) VALUES ('s1', 'u1', 't', '1', '1')");
    
    const r1 = await mockReq("PUT", "/v1/sets/s1/rating", "u1", { stars: 0 });
    expect(r1.status).toBe(400);
    const r2 = await mockReq("PUT", "/v1/sets/s1/rating", "u1", { stars: 6 });
    expect(r2.status).toBe(400);
    const r3 = await mockReq("PUT", "/v1/sets/s1/rating", "u1", { stars: 2.5 });
    expect(r3.status).toBe(400);
  });

  it("lookup returns fresh aggregates", async () => {
    await run(db, "INSERT INTO sets (id, user_id, title, created_at, updated_at) VALUES ('s1', 'u1', 't', '1', '1')");
    await mockReq("PUT", "/v1/sets/s1/rating", "u1", { stars: 4 });
    
    const res = await mockReq("POST", "/v1/ratings/lookup", "u1", { ids: ["s1"] });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, any>;
    expect(body.s1).toEqual({
      yourStars: 4,
      ratingAvg: 4,
      ratingCount: 1,
      isGlobal: false
    });
  });

  it("a client can't push aggregates through sync", async () => {
    const res = await mockReq("POST", "/v1/sync", "u1", {
      sets: [{
        id: "s1", title: "t", mode: "general", createdAt: "1", updatedAt: "1",
        ratingAvg: 5, ratingCount: 100
      }],
      cards: [], quiz: []
    });
    expect(res.status).toBe(200);
    const row = await one(db, "SELECT rating_avg, rating_count FROM sets WHERE id = 's1'");
    expect(row?.rating_avg).toBeNull();
    expect(row?.rating_count).toBe(0);
  });
});
