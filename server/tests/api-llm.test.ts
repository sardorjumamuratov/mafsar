import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { openDB, migrate, type DB } from "../src/db.js";
import { createApp } from "../src/app.js";
import { register, signAccessToken } from "../src/auth.js";

// The LLM proxy routes were only tested for 401/400. Their success paths and
// the LLMError -> 502 mapping are what the extension actually depends on: a
// provider outage that surfaces as a bare 500 gives the user "generation
// failed" with nothing to act on, which is exactly the failure mode that took
// generation down when Groq retired a model.

let db: DB;
let app: ReturnType<typeof createApp>;
let token: string;

/** A successful gemini-shaped response carrying `payload` as the model's JSON. */
const reply = (payload: unknown) =>
  vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }),
      { status: 200 }
    )
  );

beforeEach(async () => {
  db = openDB(":memory:");
  await migrate(db);
  app = createApp(db);
  const user = (await register(db, "llm@mafsar.dev", "password123"))!;
  token = await signAccessToken(user.id);
  process.env.LLM_PROVIDER = "gemini";
  process.env.LLM_API_KEY = "test-key";
  process.env.LLM_MODEL = "";
});

afterEach(() => vi.unstubAllGlobals());

const auth = () => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });
const post = (path: string, body: unknown) =>
  app.request(path, { method: "POST", headers: auth(), body: JSON.stringify(body) });

describe("LLM proxy success paths", () => {
  it("POST /v1/generate returns normalized flashcards and quiz", async () => {
    vi.stubGlobal("fetch", reply({
      flashcards: [{ front: "F", back: "B" }],
      quiz: [{ q: "Q", options: ["a", "b", "c", "d"], answer: 2, explain: "E" }],
    }));

    const res = await post("/v1/generate", { messages: [{ role: "user", text: "some source text" }] });
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.flashcards[0]).toMatchObject({ front: "F", back: "B" });
    expect(out.quiz[0].options).toHaveLength(4);
  });

  it("POST /v1/grade returns a score and feedback", async () => {
    vi.stubGlobal("fetch", reply({ score: 80, correct: true, feedback: "Good." }));

    const res = await post("/v1/grade", { question: "Q", reference: "R", answer: "A" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ score: 80, correct: true });
  });

  it("POST /v1/hypothetical returns a scenario and rubric", async () => {
    vi.stubGlobal("fetch", reply({ scenario: "You are asked to…", rubric: "Mentions X" }));

    const res = await post("/v1/hypothetical", { concept: "C", reference: "R" });
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveProperty("scenario");
  });

  it("POST /v1/summarize returns a summary and key points", async () => {
    vi.stubGlobal("fetch", reply({ summary: "TLDR", keyPoints: ["one", "two"] }));

    const res = await post("/v1/summarize", { messages: [{ role: "user", text: "hello there" }] });
    expect(res.status).toBe(200);
    expect((await res.json()).keyPoints).toEqual(["one", "two"]);
  });

  it("POST /v1/blurb returns a short blurb", async () => {
    vi.stubGlobal("fetch", reply({ blurb: "Tort law essentials" }));

    const res = await post("/v1/blurb", { title: "Torts", cardFronts: ["Negligence"] });
    expect(res.status).toBe(200);
    expect((await res.json()).blurb).toBe("Tort law essentials");
  });
});

describe("LLM failures reach the client as actionable errors", () => {
  it("maps a provider outage to 502 llm_error with the provider's message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "model `x` has been decommissioned" } }), { status: 400 })
    ));

    const res = await post("/v1/generate", { messages: [{ role: "user", text: "some source text" }] });
    expect(res.status).toBe(502);
    const out = await res.json();
    expect(out.error).toBe("llm_error");
    // Without this the extension shows a bare "generation failed".
    expect(out.message).toMatch(/decommissioned/);
  });

  it("does not leak the provider error as a generic 500", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("upstream exploded", { status: 500 })));

    const res = await post("/v1/grade", { question: "Q", reference: "R", answer: "A" });
    expect(res.status).not.toBe(500);
    expect((await res.json()).error).toBe("llm_error");
  });
});
