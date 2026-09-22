import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { openDB, migrate, all, type DB } from "../src/db.js";
import { createApp } from "../src/app.js";
import { register, signAccessToken } from "../src/auth.js";

// System design drills over HTTP: Design drill, Estimation, Find the bottleneck.
// The model is mocked; what's under test is routing, cost control, validation,
// normalisation of bad model output, and keeping the planted flaw hidden.

let db: DB;
let app: ReturnType<typeof createApp>;
let token: string;
let userId: string;

const reply = (payload: unknown) =>
  vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }), { status: 200 })
  );
const failing = () => vi.fn().mockResolvedValue(new Response("upstream down", { status: 500 }));

beforeEach(async () => {
  db = openDB(":memory:");
  await migrate(db);
  app = createApp(db);
  const user = (await register(db, "drills@mafsar.dev", "password123"))!;
  userId = user.id;
  token = await signAccessToken(user.id);
  process.env.LLM_PROVIDER = "gemini";
  process.env.LLM_API_KEY = "test-key";
  process.env.LLM_MODEL = "";
  delete process.env.FREE_PRACTICE_LIMIT;
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.FREE_PRACTICE_LIMIT;
});

const post = (path: string, body: unknown, auth = true) =>
  app.request(path, {
    method: "POST",
    headers: { ...(auth ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const practiceUnits = async () =>
  (await all(db, "SELECT id FROM generation_events WHERE user_id = ? AND category = 'practice'", [userId])).length;
const SOURCE = { concept: "Caching", reference: [{ front: "Cache-aside", back: "App reads cache, falls back to DB" }] };

describe("auth", () => {
  it.each(["/v1/design-task", "/v1/design-grade", "/v1/design-curveball", "/v1/estimation-task", "/v1/estimation-summary",
    "/v1/bottleneck-task", "/v1/bottleneck-hint", "/v1/bottleneck-grade"])("%s needs a token", async (path) => {
    expect((await post(path, {}, false)).status).toBe(401);
  });
});

describe("Design drill", () => {
  it("returns a brief and rubric, and charges one practice unit", async () => {
    vi.stubGlobal("fetch", reply({ brief: "Design a URL shortener: 5k writes/s.", rubric: ["key generation", "read path cache", 42] }));
    const res = await post("/v1/design-task", SOURCE);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.brief).toMatch(/URL shortener/);
    expect(body.rubric).toEqual(["key generation", "read path cache", "42"]);
    expect(await practiceUnits()).toBe(1);
  });

  it("refunds the unit when the model fails, with an actionable 502", async () => {
    vi.stubGlobal("fetch", reply({ nothing: true }));
    const res = await post("/v1/design-task", SOURCE);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("llm_error");
    expect(await practiceUnits()).toBe(0);
  });

  it("refuses to start when the practice quota is used up", async () => {
    process.env.FREE_PRACTICE_LIMIT = "0";
    vi.stubGlobal("fetch", reply({ brief: "x", rubric: [] }));
    expect((await post("/v1/design-task", SOURCE)).status).toBe(402);
  });

  it("normalises a messy grade: bad statuses, unknown sections, missing notes", async () => {
    vi.stubGlobal("fetch", reply({
      rubric_evaluation: [{ point: "cache", status: "great" }, { status: "covered", note: "ok" }],
      sections: [{ section: "API", verdict: "strong" }, { section: "Vibes", verdict: "strong" }, { section: "Estimates", verdict: "??" }],
    }));
    const body = await (await post("/v1/design-grade", { task: "Brief", answer: "Requirements:\nfast" })).json();
    expect(body.rubric_evaluation).toEqual([
      { point: "cache", status: "missed", note: "" },
      { point: "A rubric point", status: "covered", note: "ok" },
    ]);
    expect(body.sections).toEqual([
      { section: "API", verdict: "strong", note: "" },
      { section: "Estimates", verdict: "missing", note: "" },
    ]);
    expect(body.next_time).toBe("Keep practising.");
  });

  it("grades a curveball with the brief and the original design for context", async () => {
    const fetchMock = reply({ rubric_evaluation: [{ point: "added replicas", status: "covered", note: "" }], sections: [{ section: "API", verdict: "ok" }] });
    vi.stubGlobal("fetch", fetchMock);
    const body = await (await post("/v1/design-grade", {
      task: "Design a URL shortener", answer: "Add read replicas", curveball: "Traffic is now 10x", originalAnswer: "One Postgres",
    })).json();
    const sent = JSON.stringify(fetchMock.mock.calls[0][1]);
    expect(sent).toContain("Traffic is now 10x");
    expect(sent).toContain("One Postgres");
    expect(body.sections).toEqual([]); // sections are only for the first answer
  });

  it("rejects answers over the limit before any model call", async () => {
    const fetchMock = reply({});
    vi.stubGlobal("fetch", fetchMock);
    const res = await post("/v1/design-grade", { task: "Brief", answer: "x".repeat(4001) });
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends previous curveballs so the next one is different", async () => {
    const fetchMock = reply({ curveball: "A region goes down." });
    vi.stubGlobal("fetch", fetchMock);
    const body = await (await post("/v1/design-curveball", { task: "Brief", answer: "Design", previous: ["Traffic is now 10x"] })).json();
    expect(body.curveball).toBe("A region goes down.");
    expect(JSON.stringify(fetchMock.mock.calls[0][1])).toContain("Traffic is now 10x");
  });
});

describe("Estimation drill", () => {
  it("drops questions without a usable positive answer", async () => {
    vi.stubGlobal("fetch", reply({ questions: [
      { question: "Storage for 5 years of tweets?", reference_value: 300, reference_unit: "TB", worked_solution: "..." },
      { question: "Peak QPS?", reference_value: "12000", reference_unit: "QPS", worked_solution: "..." },
      { question: "Cache servers?", reference_value: 4, reference_unit: "servers", worked_solution: "..." },
      { question: "Broken", reference_value: "lots", reference_unit: "GB" },
      { question: "Negative", reference_value: -3, reference_unit: "GB" },
    ] }));
    const res = await post("/v1/estimation-task", SOURCE);
    expect(res.status).toBe(200);
    const { questions } = await res.json();
    expect(questions.map((q: any) => q.reference_value)).toEqual([300, 12000, 4]);
    expect(await practiceUnits()).toBe(1);
  });

  it("fails (and refunds) when fewer than three questions are usable", async () => {
    vi.stubGlobal("fetch", reply({ questions: [{ question: "Only one", reference_value: 1, reference_unit: "" }] }));
    expect((await post("/v1/estimation-task", SOURCE)).status).toBe(502);
    expect(await practiceUnits()).toBe(0);
  });

  it("summary validates the grade values and isn't charged", async () => {
    vi.stubGlobal("fetch", reply({ habit_to_fix: "Remember replication." }));
    const ok = await post("/v1/estimation-summary", { results: [{ question: "q", expected: "300 TB", answer: "250 TB", grade: "spot_on" }] });
    expect(ok.status).toBe(200);
    expect((await ok.json()).habit_to_fix).toBe("Remember replication.");
    expect(await practiceUnits()).toBe(0);
    const bad = await post("/v1/estimation-summary", { results: [{ question: "q", expected: "1", answer: "1", grade: "amazing" }] });
    expect(bad.status).toBe(400);
  });
});

describe("Find the bottleneck", () => {
  const SCENARIO = {
    narrative: "A global read-heavy API with 50k reads/s and 5k writes/s.",
    architecture: ["Client", "API servers (6x)", "Postgres primary"],
    planted_flaw: "All writes go to a single primary in one region",
    why_it_fails: "Write latency and a single point of failure",
    model_solution: "Shard by user id, or use a multi-region primary with conflict rules",
  };

  it("never exposes the planted flaw before grading", async () => {
    vi.stubGlobal("fetch", reply(SCENARIO));
    const res = await post("/v1/bottleneck-task", SOURCE);
    expect(res.status).toBe(200);
    const raw = await res.text();
    expect(raw).not.toContain("single primary");
    expect(raw).not.toContain("Shard by user");
    const body = JSON.parse(raw);
    expect(body.architecture).toEqual(SCENARIO.architecture);
    expect(typeof body.state).toBe("string");
  });

  it("grades with the decrypted flaw and reveals it afterwards; a hint costs half a point", async () => {
    vi.stubGlobal("fetch", reply(SCENARIO));
    const { state } = await (await post("/v1/bottleneck-task", SOURCE)).json();
    const fetchMock = reply({ found_flaw: true, explanation_correct: true, fix_works: "yes", feedback: "Nice." });
    vi.stubGlobal("fetch", fetchMock);
    const body = await (await post("/v1/bottleneck-grade", { state, answer: "The single primary", usedHint: true })).json();
    expect(JSON.stringify(fetchMock.mock.calls[0][1])).toContain("single primary");
    expect(body.found_flaw).toBe(true);
    expect(body.fix_works).toBe(false); // only a real true counts
    expect(body.score).toBe(1.5);
    expect(body.planted_flaw).toBe(SCENARIO.planted_flaw);
  });

  it("a forged or corrupted state is a 400, not a crash", async () => {
    vi.stubGlobal("fetch", reply({ hint: "x" }));
    const res = await post("/v1/bottleneck-hint", { state: "not.a.real-token" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("bad_state");
  });

  it("rejects a scenario without an architecture or flaw, refunding the unit", async () => {
    vi.stubGlobal("fetch", reply({ narrative: "Something", architecture: ["Only one"], planted_flaw: "" }));
    expect((await post("/v1/bottleneck-task", SOURCE)).status).toBe(502);
    expect(await practiceUnits()).toBe(0);
  });

  it("an upstream outage surfaces as 502", async () => {
    vi.stubGlobal("fetch", failing());
    expect((await post("/v1/bottleneck-task", SOURCE)).status).toBe(502);
  });
});
