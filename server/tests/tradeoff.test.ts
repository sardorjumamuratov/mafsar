import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { openDB, migrate, type DB } from "../src/db.js";
import { createApp } from "../src/app.js";
import { register, signAccessToken } from "../src/auth.js";

let db: DB;
let app: ReturnType<typeof createApp>;
let token: string;

describe("tradeoff cards generation", () => {
  beforeEach(async () => {
    db = openDB(":memory:");
    await migrate(db);
    app = createApp(db, { paddleApiKey: "", webhookSecret: "", stripeSecretKey: "", stripeWebhookSecret: "", openAiKey: "", openAiUrl: "", googleClientId: "", googleClientSecret: "", baseUrl: "", jwtSecret: "test" });
    const u = await register(db, "a@a.com", "pw");
    token = await signAccessToken(u.id);
    process.env.LLM_API_KEY = "test";
  });
  afterEach(() => {
    db.close();
    vi.restoreAllMocks();
  });

  it("sends design instructions when mode is design", async () => {
    let capturedBody = "";
    global.fetch = vi.fn().mockImplementation(async (req, opts) => {
      capturedBody = typeof opts.body === "string" ? opts.body : "";
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ flashcards: [], quiz: [], mode: "design" }) }] } }] }), { status: 200, headers: { "Content-Type": "application/json" }});
    });

    const res = await app.request("/v1/generate", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", text: "hi" }], mode: "design" })
    });
    
    if (res.status !== 200) {
      console.error(await res.text());
    }

    expect(capturedBody).toContain("System Design cards");
    expect(capturedBody).toContain("X vs Y: when would you pick each?");
  });

  it("does not send design instructions by default", async () => {
    let capturedBody = "";
    global.fetch = vi.fn().mockImplementation(async (req, opts) => {
      capturedBody = typeof opts.body === "string" ? opts.body : "";
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ flashcards: [], quiz: [], mode: "general" }) }] } }] }), { status: 200, headers: { "Content-Type": "application/json" }});
    });

    await app.request("/v1/generate", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", text: "hi" }] })
    });

    expect(capturedBody).not.toContain("System Design cards");
  });
});
