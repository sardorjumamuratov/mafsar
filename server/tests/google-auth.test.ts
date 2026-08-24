import { test, expect, describe, vi, beforeEach } from "vitest";
import { createApp } from "../src/app.js";
import { migrate, uid, run } from "../src/db.js";
import { login } from "../src/auth.js";
import * as google from "../src/google.js";
import { createClient } from "@libsql/client";

const db = createClient({ url: "file::memory:" });

beforeEach(async () => {
  await db.execute("PRAGMA foreign_keys = OFF");
  const tables = await db.execute("SELECT name FROM sqlite_master WHERE type='table'");
  for (const row of tables.rows) {
    if (row.name !== "sqlite_sequence") {
      await db.execute(`DROP TABLE ${row.name}`);
    }
  }
  await db.execute("PRAGMA foreign_keys = ON");
  await migrate(db);
  vi.resetAllMocks();
});

const app = createApp(db);

describe("Google Auth Backend", () => {
  test("start returns 501 when unconfigured", async () => {
    vi.spyOn(google, "googleConfigured").mockReturnValue(false);
    const res = await app.request("/v1/auth/google/start", { method: "POST" });
    expect(res.status).toBe(501);
  });

  test("start persists a hashed poll token, never the raw one", async () => {
    vi.spyOn(google, "googleConfigured").mockReturnValue(true);
    const res = await app.request("/v1/auth/google/start", { method: "POST" });
    const json = await res.json();
    expect(json.pollToken).toBeTruthy();
    
    // Check DB
    const rows = await db.execute("SELECT * FROM pending_logins");
    expect(rows.rows.length).toBe(1);
    expect(rows.rows[0].poll_hash).not.toBe(json.pollToken);
  });

  test("callback with unknown/expired state does not create user", async () => {
    const res = await app.request("/v1/auth/google/callback?state=unknown&code=123", { method: "GET" });
    const text = await res.text();
    expect(text).toContain("Link expired");
    
    const users = await db.execute("SELECT * FROM users");
    expect(users.rows.length).toBe(0);
  });

  test("email_verified: false is rejected and creates no user", async () => {
    vi.spyOn(google, "exchangeCode").mockResolvedValue({ id_token: "fake" });
    vi.spyOn(google, "verifyIdToken").mockRejectedValue(new Error("Email not verified by Google"));
    
    // Setup pending
    await run(db, "INSERT INTO pending_logins (id, poll_hash, code_verifier, created_at, expires_at) VALUES (?, ?, ?, ?, ?)", ["state123", "hash", "verifier", new Date().toISOString(), new Date(Date.now() + 10000).toISOString()]);

    const res = await app.request("/v1/auth/google/callback?state=state123&code=123", { method: "GET" });
    const text = await res.text();
    expect(text).toContain("Sign-in failed");
    
    const users = await db.execute("SELECT * FROM users");
    expect(users.rows.length).toBe(0);
  });

  test("aud mismatch is rejected", async () => {
    vi.spyOn(google, "exchangeCode").mockResolvedValue({ id_token: "fake" });
    vi.spyOn(google, "verifyIdToken").mockRejectedValue(new Error("aud mismatch"));
    
    await run(db, "INSERT INTO pending_logins (id, poll_hash, code_verifier, created_at, expires_at) VALUES (?, ?, ?, ?, ?)", ["state123", "hash", "verifier", new Date().toISOString(), new Date(Date.now() + 10000).toISOString()]);

    const res = await app.request("/v1/auth/google/callback?state=state123&code=123", { method: "GET" });
    const text = await res.text();
    expect(text).toContain("Sign-in failed");
  });

  test("google login for existing user links instead of creating duplicate", async () => {
    // Create password user
    const resReg = await app.request("/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ email: "test@example.com", password: "password123" }),
      headers: { "Content-Type": "application/json" }
    });
    
    vi.spyOn(google, "exchangeCode").mockResolvedValue({ id_token: "fake" });
    vi.spyOn(google, "verifyIdToken").mockResolvedValue({ sub: "google123", email: "test@example.com", emailVerified: true, name: "Test User" });

    await run(db, "INSERT INTO pending_logins (id, poll_hash, code_verifier, created_at, expires_at) VALUES (?, ?, ?, ?, ?)", ["state123", "hash", "verifier", new Date().toISOString(), new Date(Date.now() + 10000).toISOString()]);

    await app.request("/v1/auth/google/callback?state=state123&code=123", { method: "GET" });
    
    const users = await db.execute("SELECT * FROM users");
    expect(users.rows.length).toBe(1);
    expect(users.rows[0].google_sub).toBe("google123");
    
    // Original password still works
    const l = await login(db, "test@example.com", "password123");
    expect(l).toBeTruthy();
  });

  test("google created user cannot sign in with empty password", async () => {
    vi.spyOn(google, "exchangeCode").mockResolvedValue({ id_token: "fake" });
    vi.spyOn(google, "verifyIdToken").mockResolvedValue({ sub: "google123", email: "new@example.com", emailVerified: true });

    await run(db, "INSERT INTO pending_logins (id, poll_hash, code_verifier, created_at, expires_at) VALUES (?, ?, ?, ?, ?)", ["state123", "hash", "verifier", new Date().toISOString(), new Date(Date.now() + 10000).toISOString()]);

    await app.request("/v1/auth/google/callback?state=state123&code=123", { method: "GET" });
    
    // Login with empty password
    const res = await app.request("/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "new@example.com", password: "" }),
      headers: { "Content-Type": "application/json" }
    });
    // zod schema might block "" if min length is 8, but even if bypassed:
    const l = await login(db, "new@example.com", "");
    expect(l).toBeNull();
  });

  test("poll returns pending, then ready, then expired", async () => {
    vi.spyOn(google, "googleConfigured").mockReturnValue(true);
    const res = await app.request("/v1/auth/google/start", { method: "POST" });
    const { pollToken, authUrl } = await res.json();
    
    const state = new URL(authUrl).searchParams.get("state");

    // poll 1: pending
    let p = await app.request("/v1/auth/google/poll", {
      method: "POST",
      body: JSON.stringify({ pollToken }),
      headers: { "Content-Type": "application/json" }
    });
    expect((await p.json()).status).toBe("pending");

    // simulate callback success
    vi.spyOn(google, "exchangeCode").mockResolvedValue({ id_token: "fake" });
    vi.spyOn(google, "verifyIdToken").mockResolvedValue({ sub: "google123", email: "test2@example.com", emailVerified: true });
    
    await app.request(`/v1/auth/google/callback?state=${state}&code=123`, { method: "GET" });

    // poll 2: ready
    p = await app.request("/v1/auth/google/poll", {
      method: "POST",
      body: JSON.stringify({ pollToken }),
      headers: { "Content-Type": "application/json" }
    });
    const readyJson = await p.json();
    expect(readyJson.status).toBe("ready");
    expect(readyJson.accessToken).toBeTruthy();

    // poll 3: expired (deleted)
    p = await app.request("/v1/auth/google/poll", {
      method: "POST",
      body: JSON.stringify({ pollToken }),
      headers: { "Content-Type": "application/json" }
    });
    expect(p.status).toBe(410);
    expect((await p.json()).status).toBe("expired");
  });
});
