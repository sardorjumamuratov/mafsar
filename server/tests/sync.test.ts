import { describe, it, expect, beforeEach } from "vitest";
import { openDB, migrate, nowISO, type DB } from "../src/db.js";
import { register, login, signAccessToken } from "../src/auth.js";
import { applySync, changesSince, shouldWrite } from "../src/sync.js";

let db: DB;
const USER = { email: "test@mafsar.dev", password: "password123" };

beforeEach(async () => {
  db = openDB(":memory:");
  await migrate(db);
});

describe("auth", () => {
  it("registers and logs in", async () => {
    const user = await register(db, USER.email, USER.password);
    expect(user?.email).toBe(USER.email);
    const again = await register(db, USER.email, "different123");
    expect(again).toBeNull(); // duplicate rejected
    const ok = await login(db, USER.email, USER.password);
    expect(ok?.id).toBe(user?.id);
    const bad = await login(db, USER.email, "wrong");
    expect(bad).toBeNull();
  });

  it("hashes passwords", async () => {
    const user = (await register(db, USER.email, USER.password))!;
    expect(user.password_hash).not.toContain(USER.password);
  });
});

describe("sync", () => {
  const baseBody = (over: Record<string, unknown> = {}) => ({
    sets: [], cards: [], quiz: [], activity: [], reviews: [], ...over,
  });

  async function userId() {
    return (await register(db, USER.email, USER.password))!.id;
  }

  it("round-trips a set and cards", async () => {
    const id = await userId();
    const t = nowISO();
    await applySync(db, id, baseBody({
      sets: [{ id: "s1", title: "Torts", mode: "law", createdAt: t, updatedAt: t }],
      cards: [{ id: "c1", setId: "s1", front: "Rule?", back: "Answer", updatedAt: t }],
    }));
    const out = await changesSince(db, id);
    expect(out.sets).toHaveLength(1);
    expect(out.sets[0].title).toBe("Torts");
    expect(out.cards).toHaveLength(1);
    expect(out.cards[0].front).toBe("Rule?");
    expect(out.cards[0].updatedAt).toBe(t); // guards the snake_case mapping bug
  });

  it("last-write-wins on updated_at", async () => {
    const id = await userId();
    await applySync(db, id, baseBody({
      sets: [{ id: "s1", title: "v1", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-02T00:00:00Z" }],
    }));
    await applySync(db, id, baseBody({
      sets: [{ id: "s1", title: "v2", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-03T00:00:00Z" }],
    }));
    // stale write must not clobber
    await applySync(db, id, baseBody({
      sets: [{ id: "s1", title: "v1-old", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-02T00:00:00Z" }],
    }));
    const out = await changesSince(db, id);
    expect(out.sets[0].title).toBe("v2");
  });

  it("tombstones survive stale non-delete writes", async () => {
    const id = await userId();
    await applySync(db, id, baseBody({
      sets: [{ id: "s1", title: "v1", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }],
    }));
    await applySync(db, id, baseBody({
      sets: [{ id: "s1", title: "v1", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-05T00:00:00Z", deleted: true }],
    }));
    await applySync(db, id, baseBody({
      sets: [{ id: "s1", title: "v1", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-02T00:00:00Z" }],
    }));
    const out = await changesSince(db, id);
    expect(out.sets[0].deleted).toBe(true);
  });

  it("merges activity per-day with max", async () => {
    const id = await userId();
    await applySync(db, id, baseBody({ activity: [{ day: "2026-08-14", count: 3 }] }));
    await applySync(db, id, baseBody({ activity: [{ day: "2026-08-14", count: 7 }] }));
    await applySync(db, id, baseBody({ activity: [{ day: "2026-08-14", count: 5 }] }));
    expect((await changesSince(db, id)).activity[0].count).toBe(7);
  });

  it("is idempotent — replaying the same batch changes nothing", async () => {
    const id = await userId();
    const batch = baseBody({
      reviews: [{ id: "r1", cardId: "c1", grade: 4, reviewedAt: nowISO() }],
    });
    await applySync(db, id, batch);
    await applySync(db, id, batch);
    expect((await changesSince(db, id)).reviews).toHaveLength(1);
  });

  it("scopes data per user", async () => {
    const a = await userId();
    await register(db, "other@mafsar.dev", USER.password);
    const t = nowISO();
    await applySync(db, a, baseBody({
      sets: [{ id: "s1", title: "mine", createdAt: t, updatedAt: t }],
    }));
    const other = await login(db, "other@mafsar.dev", USER.password);
    expect((await changesSince(db, other!.id)).sets).toHaveLength(0);
  });
});

describe("shouldWrite", () => {
  it("compares timestamps and prefers newer", () => {
    expect(shouldWrite(undefined, { updated_at: "t1" })).toBe(true);
    expect(shouldWrite({ updated_at: "t1" }, { updated_at: "t0" })).toBe(false);
    expect(shouldWrite({ updated_at: "t1" }, { updated_at: "t2" })).toBe(true);
    expect(shouldWrite({ updated_at: "same" }, { updated_at: "same" })).toBe(false);
  });
});
