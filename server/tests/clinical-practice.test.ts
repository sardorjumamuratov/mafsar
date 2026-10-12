import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { openDB, migrate, all, type DB } from "../src/db.js";
import { createApp } from "../src/app.js";
import { register, signAccessToken } from "../src/auth.js";
import { decryptState } from "../src/crypto.js";

// docs/prompts/39: grounded, bite-sized clinical cases with levels and hints.
// The model is mocked. What's under test: coverage gating (no step for an area
// the notes don't cover), sealed answers, token-only checking of choice steps,
// one batched call for typed steps, and hints that never give the answer away.

let db: DB;
let app: ReturnType<typeof createApp>;
let token: string;
let otherToken: string;
let userId: string;

const gemini = (payload: unknown) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }), { status: 200 });
const replies = (...payloads: unknown[]) => {
  const fn = vi.fn();
  for (const p of payloads) fn.mockResolvedValueOnce(gemini(p));
  return fn;
};
const promptOf = (m: ReturnType<typeof vi.fn>, call = 0) => JSON.stringify(m.mock.calls[call][1]);

beforeEach(async () => {
  db = openDB(":memory:");
  await migrate(db);
  app = createApp(db);
  const user = (await register(db, "clinical@mafsar.dev", "password123"))!;
  const other = (await register(db, "clinical-other@mafsar.dev", "password123"))!;
  userId = user.id;
  token = await signAccessToken(user.id);
  otherToken = await signAccessToken(other.id);
  process.env.LLM_PROVIDER = "gemini";
  process.env.LLM_API_KEY = "test-key";
  process.env.LLM_MODEL = "";
  delete process.env.FREE_PRACTICE_LIMIT;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.FREE_PRACTICE_LIMIT;
});

const post = (path: string, body: unknown, as = token) =>
  app.request(path, {
    method: "POST",
    headers: { authorization: `Bearer ${as}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const practiceUnits = async () =>
  (await all(db, "SELECT id FROM generation_events WHERE user_id = ? AND category = 'practice'", [userId])).length;

const SOURCE = {
  concept: "Flu overview",
  reference: [{ front: "Flu onset", back: "Sudden fever, chills, severe aches, dry cough" }],
  level: "beginner",
};

const COVERAGE = { symptoms: true, diagnosis: true, differentials: true, tests: false, treatment: true, redFlags: true };
const FLU = {
  coverage: COVERAGE,
  vignette: "A 34-year-old woman has a 2-day history of sudden fever, chills, severe aches, a dry cough and fatigue. A coworker was ill the same way.",
  findings: [
    { id: "f1", text: "Sudden onset" }, { id: "f2", text: "High fever and chills" }, { id: "f3", text: "Severe body aches" },
    { id: "f4", text: "Dry cough" }, { id: "f5", text: "Sick coworker" },
  ],
  key_findings: ["f1", "f3"],
  finding_explanation: "Sudden onset with severe aches separates flu from a cold.",
  finding_hints: ["Re-read how it started.", "Colds build slowly.", "Look at onset and aches together."],
  diagnosis: {
    answer: "Influenza", distractors: ["Common cold", "Strep throat", "Pneumonia"],
    explanation: "Sudden high fever with severe aches and a dry cough is influenza.", source: "notes",
    hints: ["Think about how fast this came on.", "A cold would be gradual.", "It starts suddenly and spreads to contacts."],
  },
  next: {
    area: "redFlags", question: "When should she seek urgent care?", answer: "Difficulty breathing or chest pain",
    distractors: ["A mild sore throat", "A runny nose", "Feeling tired"],
    explanation: "Breathing difficulty or persistent chest pain needs urgent attention.", source: "notes",
    hints: ["Think about the lungs.", "Mild symptoms can wait.", "Breathing and chest pain."],
  },
  differential: {
    question: "What separates flu from a common cold?", answer: "Sudden onset with high fever and marked aches",
    distractors: ["Gradual onset with a runny nose", "A rash on the trunk", "Swollen glands only"],
    explanation: "A cold comes on gradually with a runny nose and little fever.", source: "notes",
    hints: ["Compare onset.", "Compare fever.", "Flu is sudden and severe."],
  },
};
const TESTS = [
  { name: "Rapid influenza test", result: "Positive for influenza A", source: "notes" },
  { name: "Chest X-ray", result: "Clear lung fields", source: "notes" },
  { name: "Complete blood count", result: "Normal white cell count", source: "notes" },
];
const WITH_TESTS = {
  ...FLU,
  coverage: { ...COVERAGE, tests: true },
  tests: TESTS,
  next: {
    area: "tests", question: "Which test would you order first?", answer: "Rapid influenza test",
    distractors: ["Chest X-ray", "Complete blood count"], explanation: "A rapid test confirms flu early.", source: "notes",
    hints: ["Think about confirming the virus.", "One test is fast and specific.", "It names the virus."],
  },
};

const start = async (payload: object = FLU, extra: object = {}) => {
  vi.stubGlobal("fetch", replies(payload));
  const res = await post("/v1/clinical-case", { ...SOURCE, ...extra });
  return res;
};

describe("starting a case", () => {
  it("builds three tap-to-answer steps at Beginner, and charges one practice unit", async () => {
    const res = await start();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.vignette).toMatch(/34-year-old/);
    expect(body.steps.map((s: any) => s.kind)).toEqual(["choice", "finding", "choice"]);
    expect(body.steps[0].options).toHaveLength(4);
    expect(body.steps[0].options.map((o: any) => o.text).sort()).toEqual(["Common cold", "Influenza", "Pneumonia", "Strep throat"]);
    expect(body.findings.map((f: any) => f.id)).toEqual(["f1", "f2", "f3", "f4", "f5"]);
    expect(body.steps.every((s: any) => s.hints.length === 3)).toBe(true);
    expect(await practiceUnits()).toBe(1);
  });

  it("never sends the answers: the key, explanations and findings stay sealed", async () => {
    const raw = await (await start()).text();
    for (const secret of ["key_findings", "Sudden onset with severe aches separates", "is influenza.", "needs urgent attention", "correct"]) {
      expect(raw).not.toContain(secret);
    }
    const body = JSON.parse(raw);
    const sealed = decryptState(body.state);
    expect(sealed.kind).toBe("clinical");
    expect(sealed.level).toBe("beginner");
    expect(sealed.schemaVersion).toBe(2);
    expect(sealed.steps[0].explanation).toMatch(/influenza/i);
  });

  it("builds only from what the notes cover: no tests step when the notes have no tests", async () => {
    const asksForTests = { ...FLU, next: { ...WITH_TESTS.next } }; // the model asks for tests anyway
    const body = await (await start(asksForTests)).json();
    const questions = body.steps.map((s: any) => s.question).join(" ");
    expect(questions).not.toMatch(/test/i);
    expect(body.steps).toHaveLength(3);
    expect(body.coverage.tests).toBe(false);
  });

  it("offers a tests step when the notes name tests", async () => {
    const body = await (await start(WITH_TESTS)).json();
    const next = body.steps[2];
    expect(next.question).toMatch(/test/i);
    expect(next.options.map((o: any) => o.text).sort()).toEqual(["Chest X-ray", "Complete blood count", "Rapid influenza test"]);
    expect(JSON.stringify(body)).not.toContain("Positive for influenza A"); // results come after the choice
  });

  it("refuses, and refunds, when the notes don't have enough to build a case", async () => {
    const thin = { ...FLU, coverage: { ...COVERAGE, diagnosis: false } };
    const res = await start(thin);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.message).toMatch(/enough clinical detail/);
    expect(await practiceUnits()).toBe(0);
    const sparse = { ...FLU, coverage: { symptoms: false, diagnosis: true, differentials: false, tests: false, treatment: false, redFlags: false } };
    expect((await start(sparse)).status).toBe(422);
  });

  it("replaces a hint that contains the answer", async () => {
    const leaky = { ...FLU, diagnosis: { ...FLU.diagnosis, hints: ["It is influenza.", "Think of onset.", "Sudden and severe."] } };
    const body = await (await start(leaky)).json();
    expect(body.steps[0].hints.join(" ")).not.toMatch(/influenza/i);
    expect(body.steps[0].hints[1]).toBe("Think of onset.");
  });

  it("the level shapes the case: Intermediate adds a differential, Advanced types the answers", async () => {
    const inter = await (await start(FLU, { level: "intermediate" })).json();
    expect(inter.steps.map((s: any) => s.kind)).toEqual(["choice", "finding", "choice", "short"]);
    expect(inter.steps[3].optional).toBe(true);
    const adv = await (await start(FLU, { level: "advanced" })).json();
    expect(adv.steps.map((s: any) => s.kind)).toEqual(["short", "finding", "short", "short"]);
    expect(adv.steps[0].options).toBeUndefined();
  });

  it("tells the model the level and to stay inside the notes, and treats the notes as data", async () => {
    const fetchMock = replies(FLU);
    vi.stubGlobal("fetch", fetchMock);
    await post("/v1/clinical-case", { ...SOURCE, level: "advanced", chains: [{ title: "Influenza", steps: [{ label: "Cause", statement: "A virus", why: "" }] }] });
    const prompt = promptOf(fetchMock);
    expect(prompt).toMatch(/advanced/i);
    expect(prompt).toMatch(/only (use )?(facts|what)/i);
    expect(prompt).toMatch(/untrusted/i);
    expect(prompt).toContain("A virus");
  });

  it("still takes the old request shape, and the old clinical route is untouched", async () => {
    vi.stubGlobal("fetch", replies({ vignette: "A case.", tests: [{ name: "X", result: "Y" }], diagnosis: "Asthma", management: "Inhaler" }));
    const old = await post("/v1/design-task", { concept: "Asthma", reference: SOURCE.reference, mode: "clinical" });
    expect(old.status).toBe(200);
    expect((await old.json()).rubric).toEqual(["X"]);
  });

  it("validates the request", async () => {
    expect((await post("/v1/clinical-case", { ...SOURCE, level: "expert" })).status).toBe(400);
    expect((await post("/v1/clinical-case", { concept: "x", reference: [] })).status).toBe(400);
  });
});

describe("checking steps", () => {
  async function begin(payload: object = FLU, level = "beginner") {
    return (await start(payload, { level })).json();
  }
  const optionId = (step: any, text: string) => step.options.find((o: any) => o.text === text).id;

  it("checks choices from the token, with no model call", async () => {
    const c = await begin();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const right = await (await post("/v1/clinical-check", { state: c.state, answers: [{ stepId: c.steps[0].id, answer: optionId(c.steps[0], "Influenza") }] })).json();
    expect(right.results[0]).toMatchObject({ stepId: c.steps[0].id, verdict: "correct", source: "notes" });
    expect(right.results[0].explanation).toMatch(/influenza/i);
    expect(right.results[0].correctOptionId).toBe(optionId(c.steps[0], "Influenza"));
    const wrong = await (await post("/v1/clinical-check", { state: c.state, answers: [{ stepId: c.steps[0].id, answer: optionId(c.steps[0], "Common cold") }] })).json();
    expect(wrong.results[0].verdict).toBe("not_quite");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checks the finding step from the token", async () => {
    const c = await begin();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const ok = await (await post("/v1/clinical-check", { state: c.state, answers: [{ stepId: c.steps[1].id, answer: "f3" }] })).json();
    expect(ok.results[0].verdict).toBe("correct");
    expect(ok.results[0].keyFindingIds).toEqual(["f1", "f3"]);
    const no = await (await post("/v1/clinical-check", { state: c.state, answers: [{ stepId: c.steps[1].id, answer: "f4" }] })).json();
    expect(no.results[0].verdict).toBe("not_quite");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an answer that isn't one of the step's options or findings, and an unknown step", async () => {
    const c = await begin();
    const bad = await post("/v1/clinical-check", { state: c.state, answers: [{ stepId: c.steps[0].id, answer: "not-an-option" }] });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe("INVALID_ANSWER");
    const unknown = await post("/v1/clinical-check", { state: c.state, answers: [{ stepId: "nope", answer: "x" }] });
    expect((await unknown.json()).error).toBe("INVALID_STEP");
    expect((await post("/v1/clinical-check", { state: c.state, answers: [{ stepId: c.steps[1].id, answer: "f9" }] })).status).toBe(400);
  });

  it("grades typed answers in one batched call, however many there are", async () => {
    const c = await begin(FLU, "advanced");
    const fetchMock = replies({ results: [
      { stepId: c.steps[0].id, verdict: "correct", note: "Right." },
      { stepId: c.steps[2].id, verdict: "partial", note: "Add chest pain." },
      { stepId: c.steps[3].id, verdict: "amazing", note: "x" },
    ] });
    vi.stubGlobal("fetch", fetchMock);
    const res = await (await post("/v1/clinical-check", { state: c.state, answers: [
      { stepId: c.steps[0].id, answer: "Influenza" },
      { stepId: c.steps[2].id, answer: "Breathing trouble" },
      { stepId: c.steps[3].id, answer: "Onset" },
    ] })).json();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.results.map((r: any) => r.verdict)).toEqual(["correct", "partial", "not_quite"]); // a bad enum is not credit
    expect(res.results[0].modelAnswer).toBe("Influenza");
    expect(promptOf(fetchMock)).toContain("Breathing trouble");
  });

  it("still returns a verdict when the typed-answer grader fails", async () => {
    const c = await begin(FLU, "advanced");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("down", { status: 500 })));
    const res = await post("/v1/clinical-check", { state: c.state, answers: [{ stepId: c.steps[0].id, answer: "Influenza" }] });
    expect(res.status).toBe(502); // an actionable error, and the client keeps the learner's text
    expect((await res.json()).error).toBe("llm_error");
  });

  it("reveals a test's result only when it was chosen, and the rest only at the end of the case", async () => {
    const c = await begin(WITH_TESTS);
    const diag = optionId(c.steps[0], "Influenza");
    const first = await (await post("/v1/clinical-check", { state: c.state, answers: [{ stepId: c.steps[0].id, answer: diag }] })).json();
    expect(first.caseDone).toBe(false);
    expect(JSON.stringify(first)).not.toContain("Clear lung fields");
    const pick = optionId(c.steps[2], "Rapid influenza test");
    const last = await (await post("/v1/clinical-check", { state: c.state, answers: [{ stepId: c.steps[2].id, answer: pick }] })).json();
    expect(last.results[0].testResult).toEqual({ name: "Rapid influenza test", result: "Positive for influenza A", source: "notes" });
    expect(last.caseDone).toBe(true);
    expect(last.otherResults.map((t: any) => t.name).sort()).toEqual(["Chest X-ray", "Complete blood count"]);
    expect(last.otherResults.every((t: any) => t.ordered === false)).toBe(true);
  });

  it("matches a typed test name to the case's tests, so Advanced learners see the result they asked for", async () => {
    const c = await begin(WITH_TESTS, "advanced");
    const testStep = c.steps.find((s: any) => s.area === "tests");
    vi.stubGlobal("fetch", replies({ results: [{ stepId: testStep.id, verdict: "correct", note: "Good first test." }] }));
    const res = await (await post("/v1/clinical-check", { state: c.state, answers: [{ stepId: testStep.id, answer: "a rapid influenza test first" }] })).json();
    expect(res.results[0].testResult).toEqual({ name: "Rapid influenza test", result: "Positive for influenza A", source: "notes" });
    vi.stubGlobal("fetch", replies({ results: [{ stepId: testStep.id, verdict: "not_quite", note: "" }] }));
    const none = await (await post("/v1/clinical-check", { state: c.state, answers: [{ stepId: testStep.id, answer: "an MRI of the head" }] })).json();
    expect(none.results[0].testResult).toBeUndefined();
  });
  it("binds the token to its user and expires it", async () => {
    const c = await begin();
    const a = { stepId: c.steps[0].id, answer: c.steps[0].options[0].id };
    const other = await post("/v1/clinical-check", { state: c.state, answers: [a] }, otherToken);
    expect((await other.json()).error).toBe("EXERCISE_EXPIRED");
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 25 * 60 * 60 * 1000);
    expect((await (await post("/v1/clinical-check", { state: c.state, answers: [a] })).json()).error).toBe("EXERCISE_EXPIRED");
  });

  it("limits answers to 200 characters and 4 per request", async () => {
    const c = await begin(FLU, "advanced");
    const id = c.steps[0].id;
    expect((await post("/v1/clinical-check", { state: c.state, answers: [{ stepId: id, answer: "x".repeat(201) }] })).status).toBe(400);
    expect((await post("/v1/clinical-check", { state: c.state, answers: Array(5).fill({ stepId: id, answer: "x" }) })).status).toBe(400);
    expect((await post("/v1/clinical-check", { state: c.state, answers: [] })).status).toBe(400);
  });
});
