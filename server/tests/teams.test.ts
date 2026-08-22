import { describe, it, expect, beforeEach } from "vitest";
import { openDB, migrate, type DB } from "../src/db.js";
import { createApp } from "../src/app.js";
import { register, signAccessToken } from "../src/auth.js";
import { applySync } from "../src/sync.js";

// Team endpoints. The dangerous boundaries: membership checks on every route
// (member emails and set titles must not leak to outsiders), unknown codes,
// and idempotent joins. The leaderboard math is pinned separately in
// teams-rank.test.ts; here we check the endpoint assembles it correctly.

let db: DB;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  db = openDB(":memory:");
  await migrate(db);
  app = createApp(db);
});

const json = { "content-type": "application/json" };
const T = "2026-01-02T00:00:00.000Z";
const T2 = "2026-01-03T00:00:00.000Z";

async function newUser(email: string) {
  const user = (await register(db, email, "password123"))!;
  return { user, token: await signAccessToken(user.id) };
}
const auth = (token: string) => ({ authorization: `Bearer ${token}`, ...json });

async function createTeam(token: string, name = "Bar cohort") {
  const res = await app.request("/v1/teams", {
    method: "POST", headers: auth(token), body: JSON.stringify({ name }),
  });
  return { res, body: await res.json() };
}
async function joinTeam(token: string, code: string) {
  const res = await app.request("/v1/teams/join", {
    method: "POST", headers: auth(token), body: JSON.stringify({ code }),
  });
  return { res, body: await res.json() };
}
async function getTeam(token: string, id: string) {
  const res = await app.request(`/v1/teams/${id}`, { headers: auth(token) });
  return { res, body: await res.json() };
}

/**
 * Owner with one mastered card + one learning card, two reviews in the last
 * week, activity today+yesterday (streak 2), and sets: newest, older, deleted.
 */
async function seedOwnerData(userId: string) {
  const today = new Date();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  await applySync(db, userId, {
    sets: [
      { id: "t1", title: "Older set", createdAt: T, updatedAt: T },
      { id: "t2", title: "Newest set", createdAt: T, updatedAt: T2 },
      { id: "t3", title: "Deleted set", createdAt: T, updatedAt: T2, deleted: true },
    ],
    cards: [
      // mastered: reps 3
      { id: "c1", setId: "t1", front: "Mastered", back: "yes", easiness: 2.5, interval: 15, repetitions: 3, dueDate: T, updatedAt: T },
      // mastered too: reps 2 on a 6+ day interval
      { id: "c2", setId: "t1", front: "Also mastered", back: "yes", easiness: 2.5, interval: 6, repetitions: 2, dueDate: T, updatedAt: T },
      // learning only
      { id: "c3", setId: "t1", front: "Learning", back: "no", easiness: 2.5, interval: 1, repetitions: 1, dueDate: T, updatedAt: T },
      // deleted — must not count
      { id: "c4", setId: "t1", front: "Gone", back: "no", easiness: 2.5, interval: 30, repetitions: 5, dueDate: T, updatedAt: T, deleted: true },
    ],
    quiz: [],
    activity: [
      { day: day(today), count: 4 },
      { day: day(yesterday), count: 9 },
    ],
    reviews: [
      { id: "r1", cardId: "c1", grade: 4, prevInterval: 0, newInterval: 1, reviewedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() },
      { id: "r2", cardId: "c1", grade: 5, prevInterval: 1, newInterval: 6, reviewedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
      // 8 days old — outside the 7-day window
      { id: "r3", cardId: "c1", grade: 5, prevInterval: 6, newInterval: 15, reviewedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString() },
    ],
  } as any);
}

describe("creating and joining teams", () => {
  it("creates a team, returns id/name and a 6-char code from the unambiguous alphabet, and makes the creator a member", async () => {
    const { user, token } = await newUser("owner@mafsar.dev");
    const { res, body } = await createTeam(token);
    expect(res.status).toBe(200);
    expect(body.name).toBe("Bar cohort");
    expect(body.id).toBeTruthy();
    expect(body.code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
    const list = await (await app.request("/v1/teams", { headers: auth(token) })).json();
    expect(list).toEqual([{ id: body.id, name: "Bar cohort", code: body.code, memberCount: 1 }]);
    expect(user.id).toBeTruthy();
  });

  it("rejects an empty name (400, zod) and requires a token (401)", async () => {
    await newUser("strict@mafsar.dev");
    const bad = await app.request("/v1/teams", { method: "POST", headers: auth((await newUser("x@mafsar.dev")).token), body: '{"name":""}' });
    expect(bad.status).toBe(400);
    const anon = await app.request("/v1/teams", { method: "POST", headers: json, body: '{"name":"t"}' });
    expect(anon.status).toBe(401);
  });

  it("joins by code; unknown code is 404, not 500", async () => {
    const owner = await newUser("creator@mafsar.dev");
    const { body } = await createTeam(owner.token);
    const joiner = await newUser("joiner@mafsar.dev");
    const joined = await joinTeam(joiner.token, body.code);
    expect(joined.res.status).toBe(200);
    expect(joined.body).toEqual({ id: body.id, name: body.name, code: body.code });
    const unknown = await joinTeam(joiner.token, "ZZZZZZ");
    expect(unknown.res.status).toBe(404);
  });

  it("re-joining is an idempotent no-op (memberCount does not double)", async () => {
    const owner = await newUser("o2@mafsar.dev");
    const { body } = await createTeam(owner.token);
    const joiner = await newUser("j2@mafsar.dev");
    await joinTeam(joiner.token, body.code);
    const again = await joinTeam(joiner.token, body.code);
    expect(again.res.status).toBe(200);
    const list = await (await app.request("/v1/teams", { headers: auth(joiner.token) })).json();
    expect(list[0].memberCount).toBe(2);
  });

  it("lists only teams the caller belongs to", async () => {
    const owner = await newUser("o3@mafsar.dev");
    const { body } = await createTeam(owner.token, "Mine");
    await createTeam(owner.token, "Also mine");
    const outsider = await newUser("outsider@mafsar.dev");
    await createTeam(outsider.token, "Theirs");
    const ownerList = await (await app.request("/v1/teams", { headers: auth(owner.token) })).json();
    expect(ownerList).toHaveLength(2);
    expect(ownerList.every((t: any) => t.name !== "Theirs")).toBe(true);
    expect(body.id).toBeTruthy();
  });
});

describe("team detail", () => {
  it("serves members, leaderboard, and learning to members — with stats computed from synced data", async () => {
    const owner = await newUser("owner@mafsar.dev");
    await seedOwnerData(owner.user.id);
    const { body: team } = await createTeam(owner.token);
    const joiner = await newUser("joiner@mafsar.dev");
    await joinTeam(joiner.token, team.code);

    const { res, body } = await getTeam(joiner.token, team.id);
    expect(res.status).toBe(200);
    expect(body.id).toBe(team.id);
    expect(body.name).toBe("Bar cohort");
    expect(body.code).toBe(team.code);

    const emails = body.members.map((m: any) => m.email).sort();
    expect(emails).toEqual(["joiner@mafsar.dev", "owner@mafsar.dev"]);

    // Owner: 2 mastered cards (deleted one excluded), 2 reviews inside the
    // 7-day window (the 8-day-old one excluded), streak 2 (today+yesterday).
    const ownerRow = body.leaderboard.find((r: any) => r.email === "owner@mafsar.dev");
    expect(ownerRow).toMatchObject({ mastered: 2, reviews7d: 2, streak: 2, rank: 1 });
    const joinerRow = body.leaderboard.find((r: any) => r.email === "joiner@mafsar.dev");
    expect(joinerRow).toMatchObject({ mastered: 0, reviews7d: 0, streak: 0, rank: 2 });

    // Learning: newest first, tombstoned set excluded, capped at 3.
    const ownerLearning = body.learning.find((l: any) => l.email === "owner@mafsar.dev");
    expect(ownerLearning.titles).toEqual(["Newest set", "Older set"]);
    expect(body.learning).toHaveLength(2);
  });

  it("hides everything from non-members (403), including unknown teams staying 403-shaped", async () => {
    const owner = await newUser("o5@mafsar.dev");
    const { body: team } = await createTeam(owner.token);
    const stranger = await newUser("stranger@mafsar.dev");
    const { res, body } = await getTeam(stranger.token, team.id);
    expect(res.status).toBe(403);
    expect(body.members).toBeUndefined();
    expect(body.leaderboard).toBeUndefined();
  });

  it("an unknown team id is 404 for a member-shaped request", async () => {
    const { token } = await newUser("o6@mafsar.dev");
    const { res } = await getTeam(token, "no-such-team");
    expect(res.status).toBe(404);
  });
});

describe("leaving a team", () => {
  it("removes the caller; afterwards the detail is 403 and the list no longer shows it", async () => {
    const owner = await newUser("o7@mafsar.dev");
    const { body: team } = await createTeam(owner.token);
    const joiner = await newUser("j7@mafsar.dev");
    await joinTeam(joiner.token, team.code);

    const leave = await app.request(`/v1/teams/${team.id}/leave`, { method: "POST", headers: auth(joiner.token) });
    expect(leave.status).toBe(200);
    expect((await getTeam(joiner.token, team.id)).res.status).toBe(403);
    const list = await (await app.request("/v1/teams", { headers: auth(joiner.token) })).json();
    expect(list).toEqual([]);
    // owner still sees the team with one member
    const ownerList = await (await app.request("/v1/teams", { headers: auth(owner.token) })).json();
    expect(ownerList[0].memberCount).toBe(1);
  });

  it("a non-member cannot leave (403, no state change)", async () => {
    const owner = await newUser("o8@mafsar.dev");
    const { body: team } = await createTeam(owner.token);
    const stranger = await newUser("s8@mafsar.dev");
    const res = await app.request(`/v1/teams/${team.id}/leave`, { method: "POST", headers: auth(stranger.token) });
    expect(res.status).toBe(403);
    const ownerList = await (await app.request("/v1/teams", { headers: auth(owner.token) })).json();
    expect(ownerList[0].memberCount).toBe(1);
  });
});
