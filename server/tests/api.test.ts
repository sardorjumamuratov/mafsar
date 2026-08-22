import { describe, it, expect, beforeEach } from "vitest";
import { openDB, migrate, type DB } from "../src/db.js";
import { createApp } from "../src/app.js";
import { register, signAccessToken, signRefreshToken } from "../src/auth.js";

// End-to-end tests over the Hono app using app.request() — no HTTP server needed.

let db: DB;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  db = openDB(":memory:");
  await migrate(db);
  app = createApp(db);
});

const json = {
  "content-type": "application/json",
};

async function newUser(email = "api@mafsar.dev") {
  const user = (await register(db, email, "password123"))!;
  return { user, token: await signAccessToken(user.id), refresh: await signRefreshToken(user.id) };
}

const auth = (token: string) => ({ authorization: `Bearer ${token}`, ...json });

describe("healthz", () => {
  it("is public", async () => {
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("auth endpoints", () => {
  it("register returns tokens and a sanitized user", async () => {
    const res = await app.request("/v1/auth/register", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ email: "new@mafsar.dev", password: "password123" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(body.user.email).toBe("new@mafsar.dev");
    expect(body.user).not.toHaveProperty("password_hash");
  });

  it("register rejects a duplicate email with 409", async () => {
    const body = JSON.stringify({ email: "dup@mafsar.dev", password: "password123" });
    await app.request("/v1/auth/register", { method: "POST", headers: json, body });
    const res = await app.request("/v1/auth/register", { method: "POST", headers: json, body });
    expect(res.status).toBe(409);
  });

  it("register rejects invalid payloads with 400 + details", async () => {
    const res = await app.request("/v1/auth/register", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ email: "not-an-email", password: "short" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation");
    expect(Array.isArray(body.details)).toBe(true);
  });

  it("login issues tokens", async () => {
    await app.request("/v1/auth/register", {
      method: "POST", headers: json,
      body: JSON.stringify({ email: "login@mafsar.dev", password: "password123" }),
    });
    const res = await app.request("/v1/auth/login", {
      method: "POST", headers: json,
      body: JSON.stringify({ email: "login@mafsar.dev", password: "password123" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).accessToken).toBeTruthy();
  });

  it("login rejects bad credentials with 401", async () => {
    await app.request("/v1/auth/register", {
      method: "POST", headers: json,
      body: JSON.stringify({ email: "login2@mafsar.dev", password: "password123" }),
    });
    const res = await app.request("/v1/auth/login", {
      method: "POST", headers: json,
      body: JSON.stringify({ email: "login2@mafsar.dev", password: "nope-nope-nope" }),
    });
    expect(res.status).toBe(401);
  });

  it("refresh exchanges a refresh token for a new access token", async () => {
    const { refresh } = await newUser("refresh@mafsar.dev");
    const res = await app.request("/v1/auth/refresh", {
      method: "POST", headers: json,
      body: JSON.stringify({ refreshToken: refresh }),
    });
    expect(res.status).toBe(200);
    const { accessToken } = await res.json();
    // The new access token actually works on a protected route.
    const me = await app.request("/v1/me", { headers: auth(accessToken) });
    expect(me.status).toBe(200);
  });

  it("refresh rejects an access token passed as refresh", async () => {
    const { token } = await newUser("refresh2@mafsar.dev");
    const res = await app.request("/v1/auth/refresh", {
      method: "POST", headers: json,
      body: JSON.stringify({ refreshToken: token }),
    });
    expect(res.status).toBe(401);
  });
});

describe("protected routes", () => {
  it("require a token (401 without)", async () => {
    for (const [method, path] of [
      ["GET", "/v1/me"],
      ["POST", "/v1/sync"],
      ["POST", "/v1/generate"],
      ["GET", "/v1/insights"],
    ] as const) {
      const res = await app.request(path, { method, headers: json, ...(method !== "GET" ? { body: "{}" } : {}) });
      expect(res.status, `${method} ${path}`).toBe(401);
    }
  });

  it("GET /v1/me returns the current user", async () => {
    const { user, token } = await newUser("me@mafsar.dev");
    const res = await app.request("/v1/me", { headers: auth(token) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.id).toBe(user.id);
    expect(body.user.email).toBe("me@mafsar.dev");
  });

  it("GET /v1/me is scoped per user", async () => {
    const a = await newUser("a@mafsar.dev");
    const b = await newUser("b@mafsar.dev");
    const res = await app.request("/v1/me", { headers: auth(b.token) });
    const body = await res.json();
    expect(body.user.id).not.toBe(a.user.id);
  });
});

describe("sync endpoint", () => {
  it("full round-trip: push then pull, second device sees the data", async () => {
    const { user, token } = await newUser("sync1@mafsar.dev");
    const t = new Date().toISOString();
    const push = await app.request("/v1/sync", {
      method: "POST", headers: auth(token),
      body: JSON.stringify({
        sets: [{ id: "s1", title: "Torts", mode: "law", createdAt: t, updatedAt: t }],
        cards: [{ id: "c1", setId: "s1", front: "Q", back: "A", updatedAt: t }],
        activity: [{ day: "2026-08-14", count: 4 }],
      }),
    });
    expect(push.status).toBe(200);
    const pushed = await push.json();
    expect(pushed.sets[0].title).toBe("Torts");
    expect(pushed.cards[0].front).toBe("Q");
    expect(pushed.activity[0].count).toBe(4);
    const serverTime = pushed.serverTime;
    expect(serverTime).toBeTruthy();

    // A "second device": same user, fresh token, first sync with no `since`.
    const secondDeviceToken = await signAccessToken(user.id);
    const pull = await app.request("/v1/sync", {
      method: "POST", headers: auth(secondDeviceToken),
      body: JSON.stringify({}),
    });
    const pulled = await pull.json();
    expect(pulled.sets).toHaveLength(1);
    expect(pulled.cards).toHaveLength(1);

    // Incremental pull since the first response returns nothing new.
    const inc = await app.request("/v1/sync", {
      method: "POST", headers: auth(secondDeviceToken),
      body: JSON.stringify({ since: serverTime }),
    });
    const incremental = await inc.json();
    expect(incremental.sets).toHaveLength(0);
    expect(incremental.cards).toHaveLength(0);
  });

  it("isolates users from each other's data", async () => {
    const alice = await newUser("alice@mafsar.dev");
    const bob = await newUser("bob@mafsar.dev");
    const t = new Date().toISOString();
    await app.request("/v1/sync", {
      method: "POST", headers: auth(alice.token),
      body: JSON.stringify({ sets: [{ id: "alice-set", title: "A", createdAt: t, updatedAt: t }] }),
    });
    const res = await app.request("/v1/sync", {
      method: "POST", headers: auth(bob.token), body: JSON.stringify({}),
    });
    const body = await res.json();
    expect(body.sets).toHaveLength(0);
  });

  it("returns quiz options as arrays (JSON round-trip)", async () => {
    const { token } = await newUser("quiz@mafsar.dev");
    const t = new Date().toISOString();
    const res = await app.request("/v1/sync", {
      method: "POST", headers: auth(token),
      body: JSON.stringify({
        quiz: [{ id: "q1", setId: "s9", q: "2+2?", options: ["3", "4", "5", "6"], answer: 1, explain: "basic math", updatedAt: t }],
      }),
    });
    const body = await res.json();
    expect(body.quiz[0].options).toEqual(["3", "4", "5", "6"]);
    expect(body.quiz[0].answer).toBe(1);
  });

  it("rejects a malformed body with 400", async () => {
    const { token } = await newUser("bad@mafsar.dev");
    const res = await app.request("/v1/sync", {
      method: "POST", headers: auth(token),
      body: JSON.stringify({ cards: [{ id: 123 }] }), // wrong shape
    });
    expect(res.status).toBe(400);
  });

  it("tolerates an empty/absent body", async () => {
    const { token } = await newUser("empty@mafsar.dev");
    const res = await app.request("/v1/sync", { method: "POST", headers: auth(token) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.serverTime).toBeTruthy();
  });
});

describe("LLM proxy endpoints", () => {
  it("still require a token (401 without)", async () => {
    for (const path of ["/v1/generate", "/v1/grade", "/v1/hypothetical", "/v1/summarize"]) {
      const res = await app.request(path, { method: "POST", headers: json, body: "{}" });
      expect(res.status, path).toBe(401);
    }
  });

  it("rejects malformed bodies with 400", async () => {
    const { token } = await newUser("llmval@mafsar.dev");
    const res = await app.request("/v1/grade", {
      method: "POST", headers: auth(token), body: JSON.stringify({ question: "" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("later-phase stubs", () => {
  it("return documented 501s (teams is implemented — see teams.test.ts)", async () => {
    const { token } = await newUser("stub@mafsar.dev");
    for (const [method, path] of [
      ["GET", "/v1/insights"],
    ] as const) {
      const res = await app.request(path, { method, headers: auth(token), ...(method !== "GET" ? { body: "{}" } : {}) });
      expect(res.status, `${method} ${path}`).toBe(501);
    }
  });
});
