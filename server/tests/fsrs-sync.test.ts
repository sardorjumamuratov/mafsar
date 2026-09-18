import { describe, it, expect, beforeEach } from "vitest";
import { openDB, migrate, run, type DB } from "../src/db.js";
import { createApp } from "../src/app.js";
import { register, signAccessToken } from "../src/auth.js";

// FSRS memory state and due dates must round-trip through /v1/sync unchanged,
// in the formats the extension (epoch ms) and the phone (ISO) both send.

let db: DB;
let app: ReturnType<typeof createApp>;
let token: string;
let userId: string;

beforeEach(async () => {
  db = openDB(":memory:");
  await migrate(db);
  app = createApp(db);
  const user = (await register(db, "fsrs@mafsar.dev", "password123"))!;
  userId = user.id;
  token = await signAccessToken(user.id);
});

const headers = () => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });
const sync = async (body: object) => {
  const res = await app.request("/v1/sync", { method: "POST", headers: headers(), body: JSON.stringify(body) });
  expect(res.status).toBe(200);
  return res.json();
};

const T = "2026-09-01T10:00:00.000Z";
const set = { id: "s1", title: "Torts", createdAt: T, updatedAt: T };

describe("FSRS fields over /v1/sync", () => {
  it("round-trips stability, difficulty, state, lapses and lastReview", async () => {
    const lastReviewMs = Date.parse("2026-08-30T08:00:00.000Z");
    await sync({
      sets: [set],
      cards: [{
        id: "c1", setId: "s1", front: "Q", back: "A", updatedAt: T,
        dueDate: Date.parse("2026-09-10T00:00:00.000Z"),
        stability: 12.5, difficulty: 4.2, state: "review", lapses: 1, lastReview: lastReviewMs,
      }],
    });
    const out = await sync({});
    const card = out.cards.find((c: any) => c.id === "c1");
    expect(card).toMatchObject({ stability: 12.5, difficulty: 4.2, state: "review", lapses: 1 });
    expect(card.lastReview).toBe(new Date(lastReviewMs).toISOString());
    expect(card.dueDate).toBe("2026-09-10T00:00:00.000Z");
  });

  it("returns a legacy epoch-ms due date as ISO, never null", async () => {
    await sync({ sets: [set], cards: [{ id: "c2", setId: "s1", front: "Q", back: "A", updatedAt: T, dueDate: "1789000000000" }] });
    const card = (await sync({})).cards.find((c: any) => c.id === "c2");
    expect(card.dueDate).toBe(new Date(1789000000000).toISOString());
  });

  it("pulls rows by when the server stored them, not by the client's clock", async () => {
    // A device whose clock is a day behind writes a row with an old updatedAt.
    const first = await sync({});
    const oldClock = new Date(Date.parse(first.serverTime) - 86_400_000).toISOString();
    await sync({ sets: [{ ...set, updatedAt: oldClock, createdAt: oldClock }] });
    const later = await sync({ since: first.serverTime });
    expect(later.sets.map((s: any) => s.id)).toContain("s1");
  });
});

describe("GET /v1/insights", () => {
  it("reports forecast, weak cards and exam readiness", async () => {
    const now = Date.now();
    const DAY = 86_400_000;
    await run(db, "INSERT INTO sets (id, user_id, title, created_at, updated_at, exam_date) VALUES (?, ?, ?, ?, ?, ?)",
      ["s1", userId, "Torts", T, T, new Date(now + 5 * DAY).toISOString()]);
    // Shaky card: low stability, last reviewed 4 days ago, due now.
    await run(db,
      `INSERT INTO cards (id, set_id, user_id, front, back, due_date, updated_at, stability, difficulty, state, lapses, last_review, repetitions, interval)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ["c1", "s1", userId, "Duty of care", "A", new Date(now).toISOString(), T, 1.2, 7, "review", 2, new Date(now - 4 * DAY).toISOString(), 3, 1]);

    const res = await app.request("/v1/insights", { headers: headers() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.forecast).toHaveLength(14);
    expect(body.forecast[0].due).toBe(1);
    expect(body.weakTopics.map((w: any) => w.cardId)).toContain("c1");
    expect(body.exams[0]).toMatchObject({ setId: "s1", cards: 1, reviewed: 1 });
  });

  it("requires a token", async () => {
    const res = await app.request("/v1/insights");
    expect(res.status).toBe(401);
  });
});
