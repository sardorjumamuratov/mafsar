import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { openDB, migrate, run, type DB } from "../src/db.js";
import { createApp } from "../src/app.js";
import { signAccessToken, register } from "../src/auth.js";

let db: DB;
let app: ReturnType<typeof createApp>;
let adminToken: string;
let userToken: string;

beforeEach(async () => {
  db = openDB(":memory:");
  await migrate(db);
  app = createApp(db);

  const admin = await register(db, "admin@mafsar.dev", "password123");
  const user = await register(db, "user@mafsar.dev", "password123");
  
  adminToken = await signAccessToken(admin.id);
  userToken = await signAccessToken(user.id);
  
  process.env.ADMIN_EMAILS = "admin@mafsar.dev";
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.ADMIN_EMAILS;
});

describe("Usage counts (analytics)", () => {
  it("increments in memory, flushes to db aggregated, and requires admin to view", async () => {
    // 1. Post to generate
    const headers = { "Content-Type": "application/json", authorization: `Bearer ${userToken}` };
    const messages = [{ role: "user", content: "hello" }];
    
    // Simulate generation requests
    const res1 = await app.request("/v1/generate", {
      method: "POST",
      headers,
      body: JSON.stringify({ messages, mode: "general" })
    });
    // It might fail 500 without LLM keys but the tracker runs before LLM call
    
    // 2. Mock Date to a specific day
    const originalDate = global.Date;
    
    // Call trackUsage via app routes or manually flush
    // Since the flush is interval based, we can import flushUsage and call it manually
    const { flushUsage } = await import("../src/analytics.js");
    await flushUsage(db);
    
    // 3. Admin access
    const adminRes = await app.request("/v1/admin/analytics", {
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(adminRes.status).toBe(200);
    const data = await adminRes.json();
    
    expect(data.counts).toBeInstanceOf(Array);
    // At least the /v1/generate hit should be here, though the actual request might fail auth/quota depending on test setup.
    // Let's directly call trackUsage to ensure pure unit test of aggregation
    const { trackUsage } = await import("../src/analytics.js");
    trackUsage("/v1/generate", "general");
    trackUsage("/v1/generate", "general");
    trackUsage("/v1/grade", "general");
    trackUsage("/v1/generate", "clinical");
    
    await flushUsage(db);
    
    const adminRes2 = await app.request("/v1/admin/analytics", {
      headers: { authorization: `Bearer ${adminToken}` }
    });
    const data2 = await adminRes2.json();
    
    const genGeneral = data2.counts.find((c: any) => c.route === "/v1/generate" && c.mode === "general");
    expect(genGeneral.count).toBe(2);
    
    const genClinical = data2.counts.find((c: any) => c.route === "/v1/generate" && c.mode === "clinical");
    expect(genClinical.count).toBe(1);
    
    // Check no identifiers
    const schema = Object.keys(data2.counts[0]);
    expect(schema).toEqual(["day", "route", "mode", "count"]);
    expect(schema.includes("user_id")).toBe(false);
  });

  it("denies access to non-admins and unauthenticated users", async () => {
    const unauthRes = await app.request("/v1/admin/analytics");
    expect(unauthRes.status).toBe(401);

    const userRes = await app.request("/v1/admin/analytics", {
      headers: { authorization: `Bearer ${userToken}` }
    });
    expect(userRes.status).toBe(403);
  });
});
