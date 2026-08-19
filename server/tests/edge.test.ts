import { describe, it, expect, beforeEach, vi } from "vitest";
import { SignJWT } from "jose";
import { openDB, migrate, type DB } from "../src/db.js";
import { createApp } from "../src/app.js";
import { register, signAccessToken, secretKey } from "../src/auth.js";
import { shouldWrite, applySync, changesSince } from "../src/sync.js";
import { generateStudySet } from "../src/llm.js";

// Edge and failure paths: cross-user id collisions, LWW ties, changesSince
// boundaries, expired/tampered JWTs, provider 429/500, truncated JSON.

let db: DB;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  db = openDB(":memory:");
  await migrate(db);
  app = createApp(db);
});

const json = { "content-type": "application/json" };
async function newUser(email: string) {
  const user = (await register(db, email, "password123"))!;
  return { user, token: await signAccessToken(user.id) };
}
const auth = (token: string) => ({ authorization: `Bearer ${token}`, ...json });

const base = (over: Record<string, unknown> = {}) => ({
  sets: [], cards: [], quiz: [], activity: [], reviews: [], ...over,
});

// --- last-write-wins conflict resolution -------------------------------------

describe("shouldWrite ties and skew", () => {
  it("equal timestamps do NOT overwrite (strict >)", () => {
    expect(shouldWrite({ updated_at: "t1" }, { updated_at: "t1" })).toBe(false);
  });

  it("1ms older loses, 1ms newer wins", () => {
    expect(shouldWrite({ updated_at: "2026-01-01T00:00:00.001Z" }, { updated_at: "2026-01-01T00:00:00.000Z" })).toBe(false);
    expect(shouldWrite({ updated_at: "2026-01-01T00:00:00.000Z" }, { updated_at: "2026-01-01T00:00:00.001Z" })).toBe(true);
  });

  it("a replayed push with the same updatedAt is a no-op (integration)", async () => {
    const { user } = await newUser("tie@mafsar.dev");
    const t = "2026-01-02T00:00:00.000Z";
    await applySync(db, user.id, base({ sets: [{ id: "s1", title: "First", createdAt: t, updatedAt: t }] }));
    // Same timestamp, different title — must NOT win.
    await applySync(db, user.id, base({ sets: [{ id: "s1", title: "Second", createdAt: t, updatedAt: t }] }));
    expect((await changesSince(db, user.id)).sets[0].title).toBe("First");
  });
});

// --- changesSince boundaries ---------------------------------------------------

describe("changesSince boundaries", () => {
  it("an exactly-equal `since` excludes the row (strictly-greater comparison)", async () => {
    const { user } = await newUser("b1@mafsar.dev");
    const t = "2026-01-02T00:00:00.000Z";
    await applySync(db, user.id, base({ sets: [{ id: "s1", title: "T", createdAt: t, updatedAt: t }] }));
    expect((await changesSince(db, user.id, t)).sets).toHaveLength(0);
    expect((await changesSince(db, user.id, "2026-01-01T23:59:59.999Z")).sets).toHaveLength(1);
  });

  it("a missing `since` returns everything", async () => {
    const { user } = await newUser("b2@mafsar.dev");
    const t = "2026-01-02T00:00:00.000Z";
    await applySync(db, user.id, base({ sets: [{ id: "s1", title: "T", createdAt: t, updatedAt: t }] }));
    expect((await changesSince(db, user.id, undefined)).sets).toHaveLength(1);
  });
});

// --- cross-user isolation: a pushed id that belongs to someone else ------------

describe("cross-user id collisions (ownership guard)", () => {
  const t = "2026-01-02T00:00:00.000Z";
  const t2 = "2026-01-03T00:00:00.000Z";

  it("user B pushing user A's set id cannot edit or steal it", async () => {
    const a = await newUser("alice@mafsar.dev");
    const b = await newUser("bob@mafsar.dev");
    await applySync(db, a.user.id, base({ sets: [{ id: "s1", title: "Alice's", createdAt: t, updatedAt: t }] }));
    await applySync(db, b.user.id, base({ sets: [{ id: "s1", title: "Hacked", createdAt: t2, updatedAt: t2 }] }));
    expect((await changesSince(db, a.user.id)).sets[0].title).toBe("Alice's");
    expect((await changesSince(db, b.user.id)).sets).toHaveLength(0);
  });

  it("user B pushing user A's card id cannot overwrite its content", async () => {
    const a = await newUser("ca@mafsar.dev");
    const b = await newUser("cb@mafsar.dev");
    await applySync(db, a.user.id, base({
      sets: [{ id: "s1", title: "A", createdAt: t, updatedAt: t }],
      cards: [{ id: "c1", setId: "s1", front: "Real", back: "A", updatedAt: t }],
    }));
    await applySync(db, b.user.id, base({
      cards: [{ id: "c1", setId: "s1", front: "Hacked", back: "B", updatedAt: t2 }],
    }));
    expect((await changesSince(db, a.user.id)).cards[0].front).toBe("Real");
    expect((await changesSince(db, b.user.id)).cards).toHaveLength(0);
  });

  it("user B pushing user A's quiz id cannot overwrite its content", async () => {
    const a = await newUser("qa@mafsar.dev");
    const b = await newUser("qb@mafsar.dev");
    await applySync(db, a.user.id, base({
      sets: [{ id: "s1", title: "A", createdAt: t, updatedAt: t }],
      quiz: [{ id: "q1", setId: "s1", q: "Real?", options: ["a", "b"], answer: 0, updatedAt: t }],
    }));
    await applySync(db, b.user.id, base({
      quiz: [{ id: "q1", setId: "s1", q: "Hacked?", options: ["x", "y"], answer: 1, updatedAt: t2 }],
    }));
    expect((await changesSince(db, a.user.id)).quiz[0].q).toBe("Real?");
    expect((await changesSince(db, b.user.id)).quiz).toHaveLength(0);
  });

  it("activity rows are isolated per user", async () => {
    const a = await newUser("aa@mafsar.dev");
    const b = await newUser("ab@mafsar.dev");
    await applySync(db, a.user.id, base({ activity: [{ day: "2026-01-02", count: 5 }] }));
    const bActivity = (await changesSince(db, b.user.id)).activity;
    expect(bActivity.some((x: { day: string }) => x.day === "2026-01-02")).toBe(false);
  });
});

// --- JWT failure modes -----------------------------------------------------------

describe("JWT failure modes", () => {
  async function expiredToken(userId: string, typ: "access" | "refresh") {
    const nowSec = Math.floor(Date.now() / 1000);
    return new SignJWT({ sub: userId, typ })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(nowSec - 7200)
      .setExpirationTime(nowSec - 3600)
      .sign(secretKey());
  }

  it("an expired access token is rejected with 401", async () => {
    const { user } = await newUser("exp@mafsar.dev");
    const token = await expiredToken(user.id, "access");
    const res = await app.request("/v1/me", { headers: auth(token) });
    expect(res.status).toBe(401);
  });

  it("a token signed with a different secret (rotated secret) is rejected", async () => {
    const { user } = await newUser("rot@mafsar.dev");
    const forged = await new SignJWT({ sub: user.id, typ: "access" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("a-completely-different-secret"));
    const res = await app.request("/v1/me", { headers: auth(forged) });
    expect(res.status).toBe(401);
  });

  it("an expired refresh token cannot mint a new access token", async () => {
    const { user } = await newUser("expref@mafsar.dev");
    const expired = await expiredToken(user.id, "refresh");
    const res = await app.request("/v1/auth/refresh", {
      method: "POST", headers: json, body: JSON.stringify({ refreshToken: expired }),
    });
    expect(res.status).toBe(401);
  });

  it("a token with extra tampered payload characters is rejected", async () => {
    const { user } = await newUser("tamper@mafsar.dev");
    const token = await signAccessToken(user.id);
    const parts = token.split(".");
    const tamperedSig = parts[2].slice(0, -2) + (parts[2].endsWith("aa") ? "bb" : "aa");
    const res = await app.request("/v1/me", { headers: auth(`${parts[0]}.${parts[1]}.${tamperedSig}`) });
    expect(res.status).toBe(401);
  });
});

// --- LLM provider failure modes (fetch mocked at the provider boundary) --------

describe("LLM provider failures", () => {
  beforeEach(() => {
    process.env.LLM_PROVIDER = "gemini";
    process.env.LLM_API_KEY = "test-key";
  });

  const statusResponse = (status: number, message: string) =>
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message } }), { status })
    );

  it("a provider 500 surfaces its message", async () => {
    vi.stubGlobal("fetch", statusResponse(500, "internal provider boom"));
    await expect(generateStudySet([{ role: "user", text: "x" }])).rejects.toThrow("internal provider boom");
    vi.unstubAllGlobals();
  });

  it("a provider 429 surfaces its message (rate limit)", async () => {
    vi.stubGlobal("fetch", statusResponse(429, "rate limited"));
    await expect(generateStudySet([{ role: "user", text: "x" }])).rejects.toThrow("rate limited");
    vi.unstubAllGlobals();
  });

  it("a truncated JSON body exhausts the single retry, then errors", async () => {
    const truncated = '{"flashcards": [{"front": "Q", "back": "A';
    const payload = JSON.stringify({ candidates: [{ content: { parts: [{ text: truncated }] } }] });
    const fetchMock = vi.fn().mockResolvedValue(new Response(payload, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(generateStudySet([{ role: "user", text: "x" }])).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2); // one retry, then give up
    vi.unstubAllGlobals();
  });
});
