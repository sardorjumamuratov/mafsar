import { describe, it, expect, beforeEach } from "vitest";
import { openDB, migrate, type DB } from "../src/db.js";
import { register } from "../src/auth.js";
import { applySync, changesSince, shouldWrite } from "../src/sync.js";

// Conflict resolution and per-user scoping are where silent data loss lives:
// a wrong comparison here doesn't throw, it just quietly discards a device's
// work or leaks one user's cards into another's pull. The existing sync tests
// cover the set table; these cover cards, quiz, boundaries, and isolation.

let db: DB;
beforeEach(async () => {
  db = openDB(":memory:");
  await migrate(db);
});

const body = (over: Record<string, unknown> = {}) => ({
  sets: [], cards: [], quiz: [], activity: [], reviews: [], ...over,
} as any);

const newUser = async (email = "a@mafsar.dev") => (await register(db, email, "password123"))!.id;

const card = (over: Record<string, unknown> = {}) => ({
  id: "c1", setId: "s1", front: "front", back: "back",
  easiness: 2.5, interval: 0, repetitions: 0, dueDate: null,
  updatedAt: "2026-01-02T00:00:00.000Z", deleted: false, ...over,
});

const question = (over: Record<string, unknown> = {}) => ({
  id: "q1", setId: "s1", q: "Question?", options: ["a", "b", "c", "d"],
  answer: 0, explain: "because", updatedAt: "2026-01-02T00:00:00.000Z",
  deleted: false, ...over,
});

describe("shouldWrite boundaries", () => {
  it("treats an equal timestamp as a no-op, not an overwrite", () => {
    // Two devices that saved in the same millisecond must not ping-pong;
    // strictly-greater is what makes replay idempotent.
    const t = "2026-01-02T00:00:00.000Z";
    expect(shouldWrite({ updated_at: t }, { updated_at: t })).toBe(false);
  });

  it("writes when nothing is stored", () => {
    expect(shouldWrite(undefined, { updated_at: "2020-01-01T00:00:00.000Z" })).toBe(true);
  });

  it("compares as ISO strings, so a skewed clock loses rather than corrupting", () => {
    expect(shouldWrite({ updated_at: "2026-01-02T00:00:00.000Z" }, { updated_at: "2025-06-01T00:00:00.000Z" })).toBe(false);
  });
});

describe("card-level last-write-wins", () => {
  it("keeps the newer card and ignores a stale replay of the older one", async () => {
    const uid = await newUser();
    await applySync(db, uid, body({ cards: [card({ front: "new", updatedAt: "2026-02-01T00:00:00.000Z" })] }));
    await applySync(db, uid, body({ cards: [card({ front: "stale", updatedAt: "2026-01-01T00:00:00.000Z" })] }));

    const { cards } = await changesSince(db, uid);
    expect(cards).toHaveLength(1);
    expect(cards[0].front).toBe("new");
  });

  it("does not resurrect a deleted card from a stale write", async () => {
    // The offline-device scenario: it never saw the delete and pushes its old
    // copy. Without the timestamp guard the card comes back from the dead.
    const uid = await newUser();
    await applySync(db, uid, body({ cards: [card({ deleted: true, updatedAt: "2026-03-01T00:00:00.000Z" })] }));
    await applySync(db, uid, body({ cards: [card({ deleted: false, updatedAt: "2026-01-01T00:00:00.000Z" })] }));

    const { cards } = await changesSince(db, uid);
    expect(cards[0].deleted).toBe(true);
  });

  it("preserves SM-2 schedule fields through a round-trip", async () => {
    const uid = await newUser();
    await applySync(db, uid, body({
      cards: [card({ easiness: 1.7, interval: 21, repetitions: 4, dueDate: 1799999999999 })],
    }));

    const { cards } = await changesSince(db, uid);
    expect(cards[0]).toMatchObject({ easiness: 1.7, interval: 21, repetitions: 4, dueDate: 1799999999999 });
  });
});

describe("quiz-level last-write-wins", () => {
  it("ignores a stale quiz update", async () => {
    const uid = await newUser();
    await applySync(db, uid, body({ quiz: [question({ q: "new", updatedAt: "2026-02-01T00:00:00.000Z" })] }));
    await applySync(db, uid, body({ quiz: [question({ q: "stale", updatedAt: "2026-01-01T00:00:00.000Z" })] }));

    const { quiz } = await changesSince(db, uid);
    expect(quiz[0].q).toBe("new");
  });

  it("round-trips options through JSON without stringifying them twice", async () => {
    const uid = await newUser();
    await applySync(db, uid, body({ quiz: [question({ options: ["w", "x", "y", "z"] })] }));

    const { quiz } = await changesSince(db, uid);
    expect(quiz[0].options).toEqual(["w", "x", "y", "z"]);
  });
});

describe("orphan handling", () => {
  it("creates a placeholder set when a card arrives before its set", async () => {
    // Batches can split across requests; without the placeholder the FK
    // rejects the card and the user silently loses it.
    const uid = await newUser();
    await applySync(db, uid, body({ cards: [card({ setId: "never-sent" })] }));

    const { sets, cards } = await changesSince(db, uid);
    expect(cards).toHaveLength(1);
    expect(sets.find((s) => s.id === "never-sent")).toBeTruthy();
  });

  it("does not overwrite a real set with a placeholder", async () => {
    const uid = await newUser();
    await applySync(db, uid, body({
      sets: [{ id: "s1", title: "Real title", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }],
    }));
    await applySync(db, uid, body({ cards: [card()] }));

    const { sets } = await changesSince(db, uid);
    expect(sets.find((s) => s.id === "s1")!.title).toBe("Real title");
  });
});

describe("cross-user isolation", () => {
  it("will not let one user overwrite another's row with the same id", async () => {
    // Ids are client-generated and the primary key is the id alone, so a
    // colliding id used to edit the other user's row in place (the ownership
    // SELECT passes vacuously — it finds nothing for *this* user — and the
    // ON CONFLICT branch then wrote to the foreign row). The upsert guard
    // makes the colliding write a no-op instead.
    const a = await newUser("a@mafsar.dev");
    const b = await newUser("b@mafsar.dev");

    await applySync(db, a, body({ cards: [card({ front: "A's card", updatedAt: "2026-01-01T00:00:00.000Z" })] }));
    await applySync(db, b, body({ cards: [card({ front: "B's card", updatedAt: "2026-09-01T00:00:00.000Z" })] }));

    // A's data is intact and B cannot read it.
    expect((await changesSince(db, a)).cards.map((c) => c.front)).toEqual(["A's card"]);
    expect((await changesSince(db, b)).cards).toHaveLength(0);
    // NOTE: B's own write is dropped rather than stored under B. Harmless for
    // real clients (ids are UUIDs) and strictly better than corrupting A, but
    // the proper fix is a composite (id, user_id) primary key, which needs a
    // data migration on the deployed database.
  });

  it("scopes quiz, activity, and reviews per user too", async () => {
    const a = await newUser("a@mafsar.dev");
    const b = await newUser("b@mafsar.dev");
    await applySync(db, a, body({
      quiz: [question()],
      activity: [{ day: "2026-01-02", count: 7 }],
      reviews: [{ id: "r1", cardId: "c1", grade: 4, prevInterval: 1, newInterval: 6, reviewedAt: "2026-01-02T00:00:00.000Z" }],
    }));

    const seenByB = await changesSince(db, b);
    expect(seenByB.quiz).toHaveLength(0);
    expect(seenByB.activity).toHaveLength(0);
    expect(seenByB.reviews).toHaveLength(0);
  });
});

describe("changesSince boundaries", () => {
  it("excludes rows stamped exactly at `since` (strictly greater)", async () => {
    // The pull cursor is the last sync time. Inclusive comparison would resend
    // the same rows forever; this pins the contract.
    const uid = await newUser();
    const t = "2026-01-02T00:00:00.000Z";
    await applySync(db, uid, body({ cards: [card({ updatedAt: t })] }));

    expect((await changesSince(db, uid, t)).cards).toHaveLength(0);
    expect((await changesSince(db, uid, "2026-01-01T23:59:59.999Z")).cards).toHaveLength(1);
  });

  it("returns everything when `since` is absent", async () => {
    const uid = await newUser();
    await applySync(db, uid, body({ cards: [card()] }));
    expect((await changesSince(db, uid)).cards).toHaveLength(1);
  });

  it("returns activity regardless of `since` (counts are max-merged, not timestamped)", async () => {
    const uid = await newUser();
    await applySync(db, uid, body({ activity: [{ day: "2026-01-02", count: 3 }] }));
    expect((await changesSince(db, uid, "2099-01-01T00:00:00.000Z")).activity).toHaveLength(1);
  });
});

describe("activity max-merge", () => {
  it("keeps the larger count when two devices report the same day", async () => {
    const uid = await newUser();
    await applySync(db, uid, body({ activity: [{ day: "2026-01-02", count: 12 }] }));
    await applySync(db, uid, body({ activity: [{ day: "2026-01-02", count: 5 }] }));

    const { activity } = await changesSince(db, uid);
    expect(activity).toEqual([{ day: "2026-01-02", count: 12 }]);
  });
});
