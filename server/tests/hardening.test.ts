import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { createApp } from "../src/app.js";
import { secretKey, register, signAccessToken } from "../src/auth.js";
import { openDB, migrate, type DB } from "../src/db.js";

describe("Server Hardening", () => {
  let db: DB;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    db = openDB(":memory:");
    await migrate(db);
    app = createApp(db);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function getAuthHeaders() {
    const user = (await register(db, "test@mafsar.dev", "pwd123"))!;
    const token = await signAccessToken(user.id);
    return { "Content-Type": "application/json", "Authorization": "Bearer " + token };
  }

  it("fails loudly if JWT_SECRET is missing outside of test mode", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", "");
    expect(() => secretKey()).toThrow("JWT_SECRET must be set to a real secret in production");

    vi.stubEnv("JWT_SECRET", "change-me");
    expect(() => secretKey()).toThrow("JWT_SECRET must be set to a real secret in production");

    vi.stubEnv("NODE_ENV", "test");
    expect(() => secretKey()).not.toThrow();

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", "some-real-secret");
    expect(() => secretKey()).not.toThrow();
  });

  it("limits body size on /v1/sync and /v1/generate", async () => {
    const headers = await getAuthHeaders();
    
    const hugeSync = { since: "2023", sets: [] };
    const hugeBodySync = JSON.stringify(hugeSync) + " ".repeat(4 * 1024 * 1024);
    let req = new Request("http://localhost/v1/sync", { method: "POST", headers, body: hugeBodySync });
    let res = await app.fetch(req);
    expect(res.status).toBe(413);

    const hugeGen = { messages: [{ role: "user", text: "hi" }] };
    const hugeBodyGen = JSON.stringify(hugeGen) + " ".repeat(2 * 1024 * 1024);
    req = new Request("http://localhost/v1/generate", { method: "POST", headers, body: hugeBodyGen });
    res = await app.fetch(req);
    expect(res.status).toBe(413);
  });

  it("rejects sync payloads with too many rows", async () => {
    const headers = await getAuthHeaders();
    const manyCards = Array(600).fill({
      id: "c1", setId: "s1", front: "f", back: "b", updatedAt: "2023-01-01T00:00:00.000Z"
    });
    const req = new Request("http://localhost/v1/sync", {
      method: "POST",
      headers,
      body: JSON.stringify({ cards: manyCards })
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(JSON.stringify(data.details)).toContain("At most 500 cards per sync batch");
  });

  it("rejects generate payloads with over-long messages", async () => {
    const headers = await getAuthHeaders();
    const req = new Request("http://localhost/v1/generate", {
      method: "POST",
      headers,
      body: JSON.stringify({ messages: [{ role: "user", text: "A".repeat(40000) }] })
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(JSON.stringify(data.details)).toContain("Message text capped at 30k chars");
  });

  it("does not earn a fresh bucket for a forged X-Forwarded-For", async () => {
    const makeReq = async (xff: string) => {
      return app.fetch(new Request("http://localhost/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Forwarded-For": xff },
        body: JSON.stringify({ email: "test@example.com", password: "pwd" })
      }));
    };
    for (let i = 0; i < 15; i++) {
      await makeReq("10.0.0." + i + ", 1.1.1.1");
    }
    const res = await makeReq("10.0.0.99, 1.1.1.1");
    expect(res.status).toBe(429);
  });
});
