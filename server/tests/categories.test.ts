import { expect, test, vi, beforeEach, afterEach } from "vitest";
import { openDB, migrate, run, all, one, DB } from "../src/db.js";
let db: DB;
import { createApp } from "../src/app.js";
let appInstance: any;
import { runCategoryWorker, computeInterests, resetCategoriesForTest } from "../src/categories.js";
import { applySync, changesSince } from "../src/sync.js";

// Mock the LLM
vi.mock("../src/llm.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/llm.js")>();
  return {
    ...actual,
    callJson: vi.fn(),
  };
});
import { callJson, LLMError } from "../src/llm.js";

const fs = require('fs');
beforeEach(async () => {
  const dbFile = "test-cats-" + Date.now() + "-" + Math.random() + ".db";
  db = openDB("file:" + dbFile);
  await migrate(db);
  appInstance = createApp(db);
  
  await run(db, "DELETE FROM user_interests");
  await run(db, "DELETE FROM categories WHERE created_by = 'ai'");
  await run(db, "DELETE FROM review_log");
  await run(db, "DELETE FROM cards");
  await run(db, "DELETE FROM sets");
  await run(db, "DELETE FROM users");
  vi.clearAllMocks();
  resetCategoriesForTest();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

test("seed tree is present, two levels deep, unique slugs", async () => {
  const cats = await all<{ slug: string; parent_id: string | null }>(db, "SELECT slug, parent_id FROM categories WHERE created_by = 'seed'");
  expect(cats.length).toBeGreaterThan(60);
  const slugs = new Set(cats.map(c => c.slug));
  expect(slugs.size).toBe(cats.length);
  
  for (const c of cats) {
    if (c.parent_id) {
      const parent = await one(db, "SELECT parent_id FROM categories WHERE id = ?", [c.parent_id]);
      expect(parent).toBeDefined();
      expect((parent as any).parent_id).toBeNull(); // Only two levels deep
    }
  }
});

test("triggers: create, title change, card-count change > 30%", async () => {
  await run(db, "INSERT INTO users (id, email, password_hash, created_at) VALUES ('u1', 'u@u.com', 'x', '2026')");
  
  // Create -> stale = 1
  await applySync(db, 'u1', {
    sets: [{ id: 's1', title: 'T1', createdAt: '2026', updatedAt: '2026' }],
    cards: [], quiz: [], activity: [], reviews: [], chains: [], chainSteps: []
  });
  
  let set = await one<any>(db, "SELECT category_stale FROM sets WHERE id = 's1'");
  expect(set.category_stale).toBe(1);
  
  await run(db, "UPDATE sets SET category_stale = 0 WHERE id = 's1'");
  
  // Title change -> stale = 1
  await applySync(db, 'u1', {
    sets: [{ id: 's1', title: 'T2', createdAt: '2026', updatedAt: '2027' }],
    cards: [], quiz: [], activity: [], reviews: [], chains: [], chainSteps: []
  });
  set = await one<any>(db, "SELECT category_stale FROM sets WHERE id = 's1'");
  expect(set.category_stale).toBe(1);
  
  await run(db, "UPDATE sets SET category_stale = 0, categorised_card_count = 10 WHERE id = 's1'");
  for (let i = 0; i < 10; i++) {
    await run(db, "INSERT INTO cards (id, set_id, user_id, front, back, updated_at, deleted) VALUES (?, 's1', 'u1', 'f', 'b', '2026', 0)", ['old_c' + i]);
  }
  
  // Card count 29% change (3 cards) -> stale = 0
  await applySync(db, 'u1', {
    sets: [],
    cards: [
      { id: 'c1', setId: 's1', front: 'f', back: 'b', createdAt: '2026', updatedAt: '2026' },
      { id: 'c2', setId: 's1', front: 'f', back: 'b', createdAt: '2026', updatedAt: '2026' }
    ], quiz: [], activity: [], reviews: [], chains: [], chainSteps: []
  });
  set = await one<any>(db, "SELECT category_stale FROM sets WHERE id = 's1'");
  expect(set.category_stale).toBe(0);
  
  // Card count 31% change (4 cards added to 10 categorised) -> stale = 1
  await applySync(db, 'u1', {
    sets: [],
    cards: [
      { id: 'c3', setId: 's1', front: 'f', back: 'b', createdAt: '2026', updatedAt: '2026' },
      { id: 'c4', setId: 's1', front: 'f', back: 'b', createdAt: '2026', updatedAt: '2026' }
    ], quiz: [], activity: [], reviews: [], chains: [], chainSteps: []
  });
  set = await one<any>(db, "SELECT category_stale FROM sets WHERE id = 's1'");
  expect(set.category_stale).toBe(1);
});

test("validation: unknown id -> failure -> retry -> Other", async () => {
  await run(db, "INSERT INTO users (id, email, password_hash, created_at) VALUES ('u1', 'u@u.com', 'x', '2026')");
  await applySync(db, 'u1', {
    sets: [{ id: 's1', title: 'T1', createdAt: '2026', updatedAt: '2026' }],
    cards: [], quiz: [], activity: [], reviews: [], chains: [], chainSteps: []
  });
  
  (callJson as any).mockResolvedValue({ category_id: "unknown_id", confidence: 0.9 });
  
  { const p = runCategoryWorker(db); await vi.runAllTimersAsync(); await p; }
  
  expect(callJson).toHaveBeenCalledTimes(3);
  const set = await one<any>(db, "SELECT category_id, category_stale FROM sets WHERE id = 's1'");
  expect(set.category_id).toBe("cat_oth");
  expect(set.category_stale).toBe(0);
});

test("new-category rule: all below 0.5, daily cap of 20", async () => {
  await run(db, "INSERT INTO users (id, email, password_hash, created_at) VALUES ('u1', 'u@u.com', 'x', '2026')");
  await applySync(db, 'u1', {
    sets: [{ id: 's1', title: 'T1', createdAt: '2026', updatedAt: '2026' }],
    cards: [], quiz: [], activity: [], reviews: [], chains: [], chainSteps: []
  });
  
  (callJson as any).mockResolvedValue({ new_category: { name: "Quantum Math", parent_id: "cat_mat" }, confidence: 0.9 });
  
  { const p = runCategoryWorker(db); await vi.runAllTimersAsync(); await p; }
  const set = await one<any>(db, "SELECT category_id FROM sets WHERE id = 's1'");
  expect(set.category_id).toMatch(/^cat_[a-z0-9]+$/);
  
  const cat = await one<any>(db, "SELECT name, parent_id FROM categories WHERE id = ?", [set.category_id]);
  expect(cat.name).toBe("Quantum Math");
  expect(cat.parent_id).toBe("cat_mat");
  
  // Test cap
  for (let i = 0; i < 20; i++) {
    await run(db, "INSERT INTO categories (id, slug, name, parent_id, created_at, created_by) VALUES (?, ?, ?, ?, ?, 'ai')",
      [`c_${i}`, `s_${i}`, `N${i}`, null, new Date().toISOString()]);
  }
  
  await run(db, "UPDATE sets SET category_stale = 1 WHERE id = 's1'");
  { const p = runCategoryWorker(db); await vi.runAllTimersAsync(); await p; }
  
  const set2 = await one<any>(db, "SELECT category_id FROM sets WHERE id = 's1'");
  expect(set2.category_id).toBe("cat_oth"); // Hit cap
});

test("rate discipline: 429 pauses for 5m", async () => {
  await run(db, "INSERT INTO users (id, email, password_hash, created_at) VALUES ('u1', 'u@u.com', 'x', '2026')");
  await applySync(db, 'u1', {
    sets: [{ id: 's1', title: 'T1', createdAt: '2026', updatedAt: '2026' }],
    cards: [], quiz: [], activity: [], reviews: [], chains: [], chainSteps: []
  });
  
  (callJson as any).mockRejectedValueOnce(new LLMError("Rate limit", 429));
  
  { const p = runCategoryWorker(db); await vi.runAllTimersAsync(); await p; }
  
  expect(callJson).toHaveBeenCalledTimes(1);
  const set = await one<any>(db, "SELECT category_stale FROM sets WHERE id = 's1'");
  expect(set.category_stale).toBe(1); // Not processed
  
  // Call again immediately, should skip
  (callJson as any).mockResolvedValue({ category_id: "cat_med", confidence: 0.9 });
  { const p = runCategoryWorker(db); await vi.runAllTimersAsync(); await p; }
  expect(callJson).toHaveBeenCalledTimes(1);
  
  // Advance 5 minutes
  vi.advanceTimersByTime(5 * 60 * 1000 + 1000);
  { const p = runCategoryWorker(db); await vi.runAllTimersAsync(); await p; }
  expect(callJson).toHaveBeenCalledTimes(2);
});

test("copy inherits root's category without model call", async () => {
  await run(db, "INSERT INTO users (id, email, password_hash, created_at) VALUES ('u1', 'u@u.com', 'x', '2026')");
  await run(db, "INSERT INTO sets (id, user_id, title, category_id, category_stale, created_at, updated_at, deleted) VALUES ('origin1', 'u1', 'Root', 'cat_med', 0, '2026', '2026', 0)");
  
  await applySync(db, 'u1', {
    sets: [{ id: 'copy1', title: 'Copy', originSetId: 'origin1', createdAt: '2026', updatedAt: '2026' }],
    cards: [], quiz: [], activity: [], reviews: [], chains: [], chainSteps: []
  });
  
  const set = await one<any>(db, "SELECT category_id, category_stale FROM sets WHERE id = 'copy1'");
  expect(set.category_id).toBe('cat_med');
  expect(set.category_stale).toBe(0);
});

test("interest formula on fixed dataset", async () => {
  await run(db, "INSERT INTO users (id, email, password_hash, created_at) VALUES ('u1', 'u@u.com', 'x', '2026')");
  
  // One set created today in cat_med_ana, one set created 45 days ago in cat_med_phy
  const today = new Date().toISOString();
  const old = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
  
  await run(db, "INSERT INTO sets (id, user_id, title, category_id, created_at, updated_at, deleted) VALUES ('s1', 'u1', 'T1', 'cat_med_ana', ?, ?, 0)", [today, today]);
  await run(db, "INSERT INTO sets (id, user_id, title, category_id, created_at, updated_at, deleted) VALUES ('s2', 'u1', 'T2', 'cat_med_phy', ?, ?, 0)", [old, old]);
  
  // Reviews: 2 for s2 today
  await run(db, "INSERT INTO cards (id, set_id, user_id, front, back, updated_at, deleted) VALUES ('c1', 's2', 'u1', 'f', 'b', ?, 0)", [old]);
  await run(db, "INSERT INTO review_log (id, user_id, card_id, grade, reviewed_at, received_at, kind) VALUES ('r1', 'u1', 'c1', 3, ?, ?, 'f')", [today, today]);
  await run(db, "INSERT INTO review_log (id, user_id, card_id, grade, reviewed_at, received_at, kind) VALUES ('r2', 'u1', 'c1', 3, ?, ?, 'f')", [today, today]);
  
  await computeInterests(db, 'u1');
  
  const ints = await all<any>(db, "SELECT category_id, weight FROM user_interests WHERE user_id = 'u1'");
  
  // Expected:
  // cat_med_ana: weight 5 (created today), last act today, decay = 1
  // cat_med_phy: weight 2 (2 reviews today), last act today, decay = 1
  // Parent cat_med gets 50% of both = 2.5 + 1 = 3.5
  // Total sum = 5 + 2 + 3.5 = 10.5
  // Normalized:
  // cat_med_ana = 5 / 10.5 = 0.476
  // cat_med_phy = 2 / 10.5 = 0.190
  // cat_med = 3.5 / 10.5 = 0.333
  
  expect(ints.length).toBe(3);
  
  const wAna = ints.find(i => i.category_id === 'cat_med_ana').weight;
  const wPhy = ints.find(i => i.category_id === 'cat_med_phy').weight;
  const wMed = ints.find(i => i.category_id === 'cat_med').weight;
  
  expect(wAna).toBeCloseTo(5 / 10.5);
  expect(wPhy).toBeCloseTo(2 / 10.5);
  expect(wMed).toBeCloseTo(3.5 / 10.5);
  
  expect(wAna + wPhy + wMed).toBeCloseTo(1);
});

test("No client-facing response contains category", async () => {
  await run(db, "INSERT INTO users (id, email, password_hash, created_at) VALUES ('u1', 'u@u.com', 'x', '2026')");
  await run(db, "INSERT INTO sets (id, user_id, title, category_id, created_at, updated_at, server_updated_at, deleted) VALUES ('s1', 'u1', 'T1', 'cat_med', '2026', '2026', '2026', 0)");
  
  const changes = await changesSince(db, 'u1');
  const setObj = changes.sets[0] as any;
  expect(setObj.category_id).toBeUndefined();
  expect(setObj.category).toBeUndefined();
  
  // share code
  const res = await appInstance.request("/v1/share", {
    method: "POST",
    headers: { "x-user-id": "u1", "content-type": "application/json" },
    body: JSON.stringify({ setId: "s1" })
  });
  const data = await res.json();
  const code = data.code;
  
  const getRes = await appInstance.request(`/v1/share/${code}`, {
    method: "GET",
    headers: { "x-user-id": "u1" }
  });
  const getData = await getRes.json();
  const str = JSON.stringify(getData);
  expect(str).not.toContain("category");
});
