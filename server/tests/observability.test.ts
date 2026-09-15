import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openDB, migrate, type DB } from "../src/db.js";
import { createApp } from "../src/app.js";
import { register, signAccessToken } from "../src/auth.js";
import { registerSchema } from "../src/schema.js";
import { initSentry, normalizeRoute, setErrorSink, type ErrorEvent } from "../src/observability.js";

let db: DB;
let app: ReturnType<typeof createApp>;
let events: ErrorEvent[];

beforeEach(async () => {
  events = [];
  setErrorSink((e) => events.push(e));
  db = openDB(":memory:");
  await migrate(db);
  app = createApp(db);
});
afterEach(() => {
  setErrorSink(null);
  delete process.env.SENTRY_DSN;
});

const SECRET = "captured-private-lecture-notes";

describe("reporting from the error handler", () => {
  it("reports an unhandled error once, with route tags and no request content", async () => {
    app.post("/boom", async (c) => {
      await c.req.json();
      throw new Error("database exploded");
    });
    const res = await app.request("/boom", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer should-not-leak" },
      body: JSON.stringify({ text: SECRET }),
    });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "internal" });
    expect(events).toHaveLength(1);
    const [e] = events;
    expect(e.level).toBe("error");
    expect((e.error as Error).message).toBe("database exploded");
    expect(e.tags).toMatchObject({ method: "POST", route: "/boom", status: "500" });
    const tagText = JSON.stringify(e.tags);
    expect(tagText).not.toContain(SECRET);
    expect(tagText).not.toContain("should-not-leak");
  });

  it("reports LLM failures as warnings and still returns the actionable 502", async () => {
    app.get("/llm-down", () => {
      throw Object.assign(new Error("provider is down"), { name: "LLMError", status: 502 });
    });
    const res = await app.request("/llm-down");
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("llm_error");
    expect(events).toHaveLength(1);
    expect(events[0].level).toBe("warning");
  });

  it("does not report validation errors", async () => {
    app.post("/invalid", () => {
      registerSchema.parse({});
      return new Response("unreachable");
    });
    expect((await app.request("/invalid", { method: "POST" })).status).toBe(400);
    expect(events).toHaveLength(0);
  });

  it("tags the signed-in user by id, never by email", async () => {
    const user = (await register(db, "tagged@mafsar.dev", "password123"))!;
    app.get("/v1/boom", () => {
      throw new Error("x");
    });
    await app.request("/v1/boom", { headers: { authorization: `Bearer ${await signAccessToken(user.id)}` } });
    expect(events[0].tags.userId).toBe(user.id);
    expect(JSON.stringify(events[0].tags)).not.toContain("tagged@mafsar.dev");
  });

  it("a broken sink never breaks the response", async () => {
    setErrorSink(() => {
      throw new Error("sink down");
    });
    app.get("/boom2", () => {
      throw new Error("x");
    });
    const res = await app.request("/boom2");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "internal" });
  });
});

describe("normalizeRoute", () => {
  it("replaces share and team codes so they never reach the error tracker", () => {
    expect(normalizeRoute("/v1/share/7KX2M9QRTA")).toBe("/v1/share/:code");
    expect(normalizeRoute("/v1/share/revoke")).toBe("/v1/share/revoke");
    expect(normalizeRoute("/v1/share")).toBe("/v1/share");
    expect(normalizeRoute("/v1/teams/abc123/leave")).toBe("/v1/teams/:id/leave");
    expect(normalizeRoute("/v1/teams/join")).toBe("/v1/teams/join");
    expect(normalizeRoute("/v1/teams")).toBe("/v1/teams");
    expect(normalizeRoute("/s/ABCDEF")).toBe("/s/:code");
    expect(normalizeRoute("/t/ABCDEF")).toBe("/t/:code");
    expect(normalizeRoute("/v1/sync")).toBe("/v1/sync");
  });
});

describe("initSentry", () => {
  it("does nothing without SENTRY_DSN", async () => {
    delete process.env.SENTRY_DSN;
    expect(await initSentry()).toBe(false);
  });
});
