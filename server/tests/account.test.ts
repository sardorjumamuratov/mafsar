import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { openDB, migrate, run, type DB } from "../src/db.js";
import { createApp } from "../src/app.js";
import { register, signAccessToken, signRefreshToken, upsertGoogleUser } from "../src/auth.js";
import { applySync } from "../src/sync.js";
import { deleteUserData } from "../src/account.js";
import { paddleProvider } from "../src/billing/index.js";

let db: DB;
let app: ReturnType<typeof createApp>;
const T = "2026-01-02T00:00:00.000Z";
const PADDLE_ENV = { PADDLE_API_KEY: "test", PADDLE_WEBHOOK_SECRET: "test", PADDLE_PRICE_ID_PLUS: "pri_test" };

beforeEach(async () => {
  db = openDB(":memory:");
  await migrate(db);
  app = createApp(db);
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const k of Object.keys(PADDLE_ENV)) delete process.env[k];
});

const json = { "content-type": "application/json" };
const auth = (t: string) => ({ authorization: `Bearer ${t}`, ...json });
const del = (token: string, body: unknown) =>
  app.request("/v1/account", { method: "DELETE", headers: auth(token), body: JSON.stringify(body) });

/**
 * Every (table, column) that identifies a user. Discovered from the schema, not
 * listed by hand, so a future table with user_id fails this suite until
 * deleteUserData handles it.
 */
async function userColumns() {
  const tables = (await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")).rows.map((r) => String(r.name));
  const out: { table: string; column: string }[] = [];
  for (const table of tables) {
    const cols = (await db.execute(`PRAGMA table_info(${table})`)).rows.map((r) => String(r.name));
    for (const column of ["user_id", "owner_id"]) if (cols.includes(column)) out.push({ table, column });
  }
  out.push({ table: "users", column: "id" });
  return out;
}

async function rowsFor(userId: string) {
  let n = 0;
  for (const { table, column } of await userColumns()) {
    const r = await db.execute({ sql: `SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?`, args: [userId] });
    n += Number(r.rows[0].n);
  }
  return n;
}

/**
 * A user with data in as many tables as possible. If applySync's input shape has
 * changed since this was written, adapt the seed, not the assertions.
 */
async function seededUser(email: string) {
  const user = (await register(db, email, "password123"))!;
  const token = await signAccessToken(user.id);
  const setId = `set-${user.id}`;
  await applySync(db, user.id, {
    sets: [{ id: setId, title: "Set", createdAt: T, updatedAt: T }],
    cards: [{ id: `card-${user.id}`, setId, front: "front", back: "back", updatedAt: T }],
    quiz: [],
    activity: [],
    reviews: [],
  } as any);
  await app.request("/v1/share", { method: "POST", headers: auth(token), body: JSON.stringify({ setId }) });
  await run(db, "INSERT INTO generation_events (id, user_id, category, created_at) VALUES (?, ?, 'set', ?)", [`ge-${user.id}`, user.id, T]);
  await run(
    db,
    "INSERT INTO review_log (id, user_id, card_id, grade, prev_interval, new_interval, reviewed_at) VALUES (?, ?, ?, 4, 0, 1, ?)",
    [`rl-${user.id}`, user.id, `card-${user.id}`, T]
  );
  return { user, token };
}

async function teamOwnedBy(ownerId: string, memberId: string) {
  const teamId = `team-${ownerId}`;
  await run(db, "INSERT INTO teams (id, name, code, owner_id, created_at) VALUES (?, 'Study group', ?, ?, ?)", [teamId, `CODE${ownerId.slice(0, 6)}`, ownerId, T]);
  await run(db, "INSERT INTO team_members (team_id, user_id, joined_at) VALUES (?, ?, ?)", [teamId, ownerId, T]);
  await run(db, "INSERT INTO team_members (team_id, user_id, joined_at) VALUES (?, ?, ?)", [teamId, memberId, T]);
  return teamId;
}

describe("deleteUserData", () => {
  it("removes the user from every table that references users, and nobody else", async () => {
    const { user } = await seededUser("gone@mafsar.dev");
    const { user: other } = await seededUser("stays@mafsar.dev");
    await teamOwnedBy(other.id, user.id); // the deleted user is a member of someone else's team
    const otherBefore = await rowsFor(other.id);
    expect(await rowsFor(user.id)).toBeGreaterThan(3);

    await deleteUserData(db, user.id);

    expect(await rowsFor(user.id)).toBe(0);
    expect(await rowsFor(other.id)).toBe(otherBefore);
  });

  it("dissolves teams the user owns, including other people's memberships", async () => {
    const { user } = await seededUser("owner@mafsar.dev");
    const { user: member } = await seededUser("member@mafsar.dev");
    const teamId = await teamOwnedBy(user.id, member.id);

    await deleteUserData(db, user.id);

    expect((await db.execute({ sql: "SELECT COUNT(*) AS n FROM teams WHERE id = ?", args: [teamId] })).rows[0].n).toBe(0);
    expect((await db.execute({ sql: "SELECT COUNT(*) AS n FROM team_members WHERE team_id = ?", args: [teamId] })).rows[0].n).toBe(0);
    expect(await rowsFor(member.id)).toBeGreaterThan(0); // the member's own data is untouched
  });
});

describe("DELETE /v1/account", () => {
  it("requires a token", async () => {
    const res = await app.request("/v1/account", { method: "DELETE", headers: json, body: JSON.stringify({ confirm: "DELETE" }) });
    expect(res.status).toBe(401);
  });

  it("requires the typed confirmation", async () => {
    const { user, token } = await seededUser("noconfirm@mafsar.dev");
    expect((await del(token, { password: "password123" })).status).toBe(400);
    expect((await del(token, { confirm: "delete", password: "password123" })).status).toBe(400);
    expect(await rowsFor(user.id)).toBeGreaterThan(0);
  });

  it("refuses a wrong password and deletes nothing", async () => {
    const { user, token } = await seededUser("wrongpw@mafsar.dev");
    const res = await del(token, { confirm: "DELETE", password: "not-my-password" });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("wrong_password");
    expect(await rowsFor(user.id)).toBeGreaterThan(0);
  });

  it("deletes everything with the right password", async () => {
    const { user, token } = await seededUser("bye@mafsar.dev");
    const res = await del(token, { confirm: "DELETE", password: "password123" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(await rowsFor(user.id)).toBe(0);
  });

  it("a Google-only account needs no password", async () => {
    const user = await upsertGoogleUser(db, { sub: "google-123", email: "g@mafsar.dev" });
    const res = await del(await signAccessToken(user.id), { confirm: "DELETE" });
    expect(res.status).toBe(200);
    expect(await rowsFor(user.id)).toBe(0);
  });

  it("cancels an active subscription before deleting", async () => {
    Object.assign(process.env, PADDLE_ENV);
    const { user, token } = await seededUser("payer@mafsar.dev");
    await run(db, "UPDATE users SET billing_customer_id = 'ctm_1', billing_provider = 'paddle', plan = 'pro' WHERE id = ?", [user.id]);
    const cancel = vi.spyOn(paddleProvider, "cancelSubscriptions").mockResolvedValue(undefined);

    const res = await del(token, { confirm: "DELETE", password: "password123" });

    expect(res.status).toBe(200);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel.mock.calls[0][0].userId).toBe(user.id);
    expect(await rowsFor(user.id)).toBe(0);
  });

  it("if cancelling the subscription fails, nothing is deleted", async () => {
    Object.assign(process.env, PADDLE_ENV);
    const { user, token } = await seededUser("stuck@mafsar.dev");
    await run(db, "UPDATE users SET billing_customer_id = 'ctm_2', billing_provider = 'paddle', plan = 'plus' WHERE id = ?", [user.id]);
    vi.spyOn(paddleProvider, "cancelSubscriptions").mockRejectedValue(new Error("paddle down"));

    const res = await del(token, { confirm: "DELETE", password: "password123" });

    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("billing_cancel_failed");
    expect(await rowsFor(user.id)).toBeGreaterThan(0);
  });
});

describe("a deleted account stays deleted", () => {
  it("its refresh token no longer works", async () => {
    const { user, token } = await seededUser("refresh@mafsar.dev");
    const refreshToken = await signRefreshToken(user.id);
    await del(token, { confirm: "DELETE", password: "password123" });
    const res = await app.request("/v1/auth/refresh", { method: "POST", headers: json, body: JSON.stringify({ refreshToken }) });
    expect(res.status).toBe(401);
  });

  it("a still-valid access token can't sync data back into existence", async () => {
    const { user, token } = await seededUser("zombie@mafsar.dev");
    await del(token, { confirm: "DELETE", password: "password123" });
    const res = await app.request("/v1/sync", {
      method: "POST",
      headers: auth(token),
      body: JSON.stringify({ sets: [{ id: "resurrected", title: "Back", createdAt: T, updatedAt: T }], cards: [], quiz: [], activity: [], reviews: [] }),
    });
    expect(res.status).toBe(401);
    expect(await rowsFor(user.id)).toBe(0);
  });

  it("every other authenticated route refuses it too", async () => {
    const { token } = await seededUser("me-gone@mafsar.dev");
    await del(token, { confirm: "DELETE", password: "password123" });
    expect((await app.request("/v1/me", { headers: auth(token) })).status).toBe(401);
  });
});

describe("GET /v1/me", () => {
  it("says whether the account has a password, and never returns the hash", async () => {
    const { token } = await seededUser("pw@mafsar.dev");
    const body = await (await app.request("/v1/me", { headers: auth(token) })).json();
    expect(body.hasPassword).toBe(true);
    expect(JSON.stringify(body)).not.toContain("password_hash");
    const g = await upsertGoogleUser(db, { sub: "google-456", email: "gg@mafsar.dev" });
    const gBody = await (await app.request("/v1/me", { headers: auth(await signAccessToken(g.id)) })).json();
    expect(gBody.hasPassword).toBe(false);
  });
});
