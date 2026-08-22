import { describe, it, expect, beforeEach } from "vitest";
import { openDB, migrate, all, type DB } from "../src/db.js";
import { createApp } from "../src/app.js";
import { register, signAccessToken } from "../src/auth.js";
import { applySync } from "../src/sync.js";

// A share is a copy handoff, and the failure modes are leaks and collisions:
// another user's set served on a guessed id, personal SM-2/exam data riding
// along, sender ids colliding with the recipient's rows on import. These
// tests pin exactly those boundaries.

let db: DB;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  db = openDB(":memory:");
  await migrate(db);
  app = createApp(db);
});

const json = { "content-type": "application/json" };
const T = "2026-01-02T00:00:00.000Z";

async function newUser(email: string) {
  const user = (await register(db, email, "password123"))!;
  return { user, token: await signAccessToken(user.id) };
}
const auth = (token: string) => ({ authorization: `Bearer ${token}`, ...json });

/** A set owned by `user` with two cards (one deleted) + one quiz question. */
async function seedSet(userId: string) {
  await applySync(db, userId, {
    sets: [{ id: "s1", title: "Torts basics", createdAt: T, updatedAt: T }],
    cards: [
      { id: "c1", setId: "s1", front: "Duty of care", back: "Obligation to avoid acts you can foresee harming others", easiness: 2.1, interval: 6, repetitions: 3, dueDate: T, updatedAt: T },
      { id: "c2", setId: "s1", front: "Res ipsa loquitur", back: "The thing speaks for itself", easiness: 2.5, interval: 0, repetitions: 1, dueDate: null, updatedAt: T },
      { id: "c3", setId: "s1", front: "Deleted card", back: "gone", updatedAt: T, deleted: true },
    ],
    quiz: [{ id: "q1", setId: "s1", q: "Which element links breach to harm?", options: ["Causation", "Duty", "Damages", "Defence"], answer: 0, explain: "but-for test", updatedAt: T }],
    activity: [], reviews: [],
  } as any);
}

async function shareSet(token: string, setId = "s1") {
  const res = await app.request("/v1/share", {
    method: "POST", headers: auth(token), body: JSON.stringify({ setId }),
  });
  return { res, body: await res.json() };
}

describe("creating a share", () => {
  it("succeeds for a set you own and returns a 10-char code from the unambiguous alphabet", async () => {
    const { user, token } = await newUser("owner@mafsar.dev");
    await seedSet(user.id);
    const { res, body } = await shareSet(token);
    expect(res.status).toBe(200);
    expect(body.code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{10}$/);
  });

  it("rejects a set you do NOT own, and creates nothing", async () => {
    const { user: owner } = await newUser("owner2@mafsar.dev");
    await seedSet(owner.id);
    const { token: stranger } = { token: (await newUser("stranger@mafsar.dev")).token };
    const { res } = await shareSet(stranger);
    expect(res.status).toBe(404);
    const rows = await all(db, "SELECT * FROM shares");
    expect(rows).toHaveLength(0);
  });

  it("re-sharing the same set returns the SAME code, not a second row", async () => {
    const { user, token } = await newUser("owner3@mafsar.dev");
    await seedSet(user.id);
    const first = await shareSet(token);
    const second = await shareSet(token);
    expect(second.body.code).toBe(first.body.code);
    expect((await all(db, "SELECT * FROM shares"))).toHaveLength(1);
  });

  it("requires a token (401 without)", async () => {
    const res = await app.request("/v1/share", { method: "POST", headers: json, body: '{"setId":"s1"}' });
    expect(res.status).toBe(401);
  });
});

describe("fetching a shared set", () => {
  it("returns only content: no SM-2 fields, examDate, owner identity, or original ids", async () => {
    const { user, token } = await newUser("owner4@mafsar.dev");
    await seedSet(user.id);
    const { body } = await shareSet(token);
    const res = await app.request(`/v1/share/${body.code}`, { headers: auth(token) });
    expect(res.status).toBe(200);
    const payload = await res.json();

    expect(payload.title).toBe("Torts basics");
    // tombstoned card excluded
    expect(payload.cards).toHaveLength(2);
    expect(payload.cards[0]).toEqual({ front: "Duty of care", back: "Obligation to avoid acts you can foresee harming others" });
    const flat = JSON.stringify(payload);
    for (const leak of ["easiness", "interval", "repetitions", "dueDate", "examDate", "user_id", user.id, "c1", "c2", "q1", "s1", "@"]) {
      expect(flat.includes(leak)).toBe(false);
    }
    expect(payload.quiz[0].q).toBe("Which element links breach to harm?");
  });

  it("a revoked code returns 404", async () => {
    const { user, token } = await newUser("owner5@mafsar.dev");
    await seedSet(user.id);
    const { body } = await shareSet(token);
    await app.request("/v1/share/revoke", { method: "POST", headers: auth(token), body: JSON.stringify({ code: body.code }) });
    const res = await app.request(`/v1/share/${body.code}`, { headers: auth(token) });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBeTruthy();
  });

  it("an unknown code returns 404, not 500", async () => {
    const { token } = await newUser("guest@mafsar.dev");
    const res = await app.request("/v1/share/XXXXXXXX", { headers: auth(token) });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not_found");
  });

  it("requires a token (401 without)", async () => {
    const res = await app.request("/v1/share/ABCDEF", );
    expect(res.status).toBe(401);
  });

  it("rate-limits lookups past 30/minute (the code space must not be walkable)", async () => {
    const { token } = await newUser("walker@mafsar.dev");
    let last = 0;
    for (let i = 0; i < 32; i++) {
      last = (await app.request("/v1/share/XXXXXXXX", { headers: auth(token) })).status;
    }
    expect(last).toBe(429);
  });
});

describe("revoking", () => {
  it("the owner can revoke; a stranger cannot revoke someone else's code", async () => {
    const { user, token } = await newUser("owner6@mafsar.dev");
    await seedSet(user.id);
    const { body } = await shareSet(token);
    const strangerToken = (await newUser("stranger2@mafsar.dev")).token;
    const strangerRes = await app.request("/v1/share/revoke", {
      method: "POST", headers: auth(strangerToken), body: JSON.stringify({ code: body.code }),
    });
    expect(strangerRes.status).toBe(404); // not theirs — and no leak that it exists
    // still fetchable after the stranger's attempt
    expect((await app.request(`/v1/share/${body.code}`, { headers: auth(token) })).status).toBe(200);
    const ownerRes = await app.request("/v1/share/revoke", {
      method: "POST", headers: auth(token), body: JSON.stringify({ code: body.code }),
    });
    expect(ownerRes.status).toBe(200);
    expect((await app.request(`/v1/share/${body.code}`, { headers: auth(token) })).status).toBe(404);
  });

  it("revoking twice reports the second as a no-op (404, not 500)", async () => {
    const { user, token } = await newUser("owner7@mafsar.dev");
    await seedSet(user.id);
    const { body } = await shareSet(token);
    await app.request("/v1/share/revoke", { method: "POST", headers: auth(token), body: JSON.stringify({ code: body.code }) });
    const second = await app.request("/v1/share/revoke", { method: "POST", headers: auth(token), body: JSON.stringify({ code: body.code }) });
    expect(second.status).toBe(404);
  });
});
