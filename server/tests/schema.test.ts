import { describe, it, expect } from "vitest";
import {
  registerSchema, loginSchema, syncSchema,
  setSchema, cardSchema, quizSchema, activitySchema, reviewSchema,
} from "../src/schema.js";
import { openDB, migrate, one, all, run } from "../src/db.js";

describe("auth schemas", () => {
  it("accepts valid credentials", () => {
    expect(registerSchema.parse({ email: "a@b.co", password: "password123" })).toBeTruthy();
  });
  it("rejects bad emails and short passwords", () => {
    expect(registerSchema.safeParse({ email: "nope", password: "password123" }).success).toBe(false);
    expect(registerSchema.safeParse({ email: "a@b.co", password: "short" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.co" }).success).toBe(false);
  });
});

describe("sync schema", () => {
  it("defaults all arrays to empty and since to undefined", () => {
    const parsed = syncSchema.parse({});
    expect(parsed).toEqual({ sets: [], cards: [], quiz: [], activity: [], reviews: [] });
    expect(parsed.since).toBeUndefined();
  });

  it("applies card SM-2 defaults for omitted fields", () => {
    const card = cardSchema.parse({ id: "c1", setId: "s1", front: "Q", back: "A", updatedAt: "t" });
    expect(card.easiness).toBe(2.5);
    expect(card.interval).toBe(0);
    expect(card.repetitions).toBe(0);
  });

  it("applies set mode default 'general'", () => {
    const set = setSchema.parse({ id: "s1", title: "T", createdAt: "t", updatedAt: "t" });
    expect(set.mode).toBe("general");
  });

  it("accepts nullable optional fields on sets", () => {
    const set = setSchema.parse({
      id: "s1", title: "T", createdAt: "t", updatedAt: "t",
      source: null, sourceLabel: null, examDate: null, deleted: false,
    });
    expect(set.examDate).toBeNull();
    expect(set.deleted).toBe(false);
  });

  it("validates quiz shape", () => {
    const ok = quizSchema.parse({ id: "q1", setId: "s1", q: "?", options: ["a", "b"], answer: 0, updatedAt: "t" });
    expect(ok.options).toHaveLength(2);
    expect(quizSchema.safeParse({ id: "q1", setId: "s1", q: "?", options: ["only-one"], answer: 0, updatedAt: "t" }).success).toBe(false);
    expect(quizSchema.safeParse({ id: "q1", setId: "s1", q: "?", options: [], answer: 0, updatedAt: "t" }).success).toBe(false);
    expect(quizSchema.safeParse({ id: "q1", setId: "s1", q: "?", options: ["a", "b"], answer: -1, updatedAt: "t" }).success).toBe(false);
  });

  it("enforces YYYY-MM-DD activity days", () => {
    expect(activitySchema.safeParse({ day: "2026-08-14", count: 3 }).success).toBe(true);
    expect(activitySchema.safeParse({ day: "14/08/2026", count: 3 }).success).toBe(false);
    expect(activitySchema.safeParse({ day: "2026-08-14", count: -1 }).success).toBe(false);
  });

  it("bounds review grades 0..5", () => {
    expect(reviewSchema.safeParse({ id: "r", cardId: "c", grade: 5, reviewedAt: "t" }).success).toBe(true);
    expect(reviewSchema.safeParse({ id: "r", cardId: "c", grade: 6, reviewedAt: "t" }).success).toBe(false);
    expect(reviewSchema.safeParse({ id: "r", cardId: "c", grade: -1, reviewedAt: "t" }).success).toBe(false);
  });
});

describe("db + migrations", () => {
  it("creates all tables and is idempotent on re-run", async () => {
    const db = openDB(":memory:");
    await migrate(db);
    const tables = await all<{ name: string }>(
      db, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    const names = tables.map((t) => t.name);
    for (const t of ["users", "sets", "cards", "quiz", "activity", "review_log", "shares", "teams", "team_members", "migrations"]) {
      expect(names).toContain(t);
    }
    // Re-running migrations must not throw or duplicate.
    await expect(migrate(db)).resolves.toBeUndefined();
    const rows = await one<{ n: number }>(db, "SELECT COUNT(*) n FROM migrations");
    expect(Number(rows!.n)).toBe(11); // one per MIGRATIONS entry
  });

  it("enforces FK integrity for cards", async () => {
    const db = openDB(":memory:");
    await migrate(db);
    await expect(
      run(db, "INSERT INTO cards (id, set_id, user_id, front, back, updated_at) VALUES ('c', 'nope', 'nope', 'f', 'b', 't')")
    ).rejects.toThrow();
  });
});
