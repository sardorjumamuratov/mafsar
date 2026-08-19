import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { openDB, migrate, type DB } from "../src/db.js";
import { createApp } from "../src/app.js";
import { register, signAccessToken } from "../src/auth.js";
import { generateCodingTask, gradeCode, codeLineCount } from "../src/llm.js";

// Coding mode's contract: tasks stay bite-sized, submissions are bounded, and the
// grade is a per-requirement checklist. The model is mocked — what's under test is
// the normalisation around it, which is where a bad model response turns into a
// broken UI rather than a clean error.

let db: DB;
let app: ReturnType<typeof createApp>;
let token: string;

const reply = (payload: unknown) =>
  vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }),
      { status: 200 }
    )
  );

const TASK = {
  scenario: "Make balance readable but not directly assignable.",
  language: "java",
  starter: "class BankAccount {\n    // your code here\n}",
  expectedLines: 15,
  rubric: ["balance is private", "a getter exposes balance"],
};

beforeEach(async () => {
  db = openDB(":memory:");
  await migrate(db);
  app = createApp(db);
  const user = (await register(db, "code@mafsar.dev", "password123"))!;
  token = await signAccessToken(user.id);
  process.env.LLM_PROVIDER = "gemini";
  process.env.LLM_API_KEY = "test-key";
  process.env.LLM_MODEL = "";
});
afterEach(() => vi.unstubAllGlobals());

const post = (path: string, body: unknown) =>
  app.request(path, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("codeLineCount", () => {
  it("ignores blank lines and comment-only lines", () => {
    expect(codeLineCount("int a = 1;\n\n// a comment\n  # py comment\nint b = 2;")).toBe(2);
  });
  it("handles CRLF endings", () => {
    expect(codeLineCount("a\r\n\r\nb")).toBe(2);
  });
  it("is 0 for empty input", () => {
    expect(codeLineCount("")).toBe(0);
  });
});

describe("generateCodingTask", () => {
  it("normalises a well-formed task", async () => {
    vi.stubGlobal("fetch", reply(TASK));
    const t = await generateCodingTask("Encapsulation", "Private fields with accessors.");
    expect(t).toMatchObject({ language: "java", expectedLines: 15 });
    expect(t.rubric).toHaveLength(2);
  });

  it("clamps an oversized expectedLines back to bite-sized", async () => {
    // A 400-line "exercise" defeats the whole feature, so the ceiling is enforced
    // here rather than trusted to the prompt.
    vi.stubGlobal("fetch", reply({ ...TASK, expectedLines: 400 }));
    expect((await generateCodingTask("C", "R")).expectedLines).toBe(60);
  });

  it("defaults a missing expectedLines instead of producing NaN", async () => {
    vi.stubGlobal("fetch", reply({ ...TASK, expectedLines: undefined }));
    expect((await generateCodingTask("C", "R")).expectedLines).toBe(15);
  });

  it("reduces a chatty language label to a bare identifier", async () => {
    // "Java (17+)" gets rendered as a label and echoed back as a prompt hint.
    vi.stubGlobal("fetch", reply({ ...TASK, language: "Java (17+)" }));
    expect((await generateCodingTask("C", "R")).language).toBe("java17+");
  });

  it("caps the rubric at 4 so the checklist stays scannable", async () => {
    vi.stubGlobal("fetch", reply({ ...TASK, rubric: ["a", "b", "c", "d", "e", "f"] }));
    expect((await generateCodingTask("C", "R")).rubric).toHaveLength(4);
  });

  it("rejects a task with no rubric rather than shipping an ungradeable exercise", async () => {
    vi.stubGlobal("fetch", reply({ ...TASK, rubric: [] }));
    await expect(generateCodingTask("C", "R")).rejects.toThrow(/incomplete/i);
  });
});

describe("gradeCode", () => {
  const base = { task: "t", rubric: ["r1", "r2"], language: "java", expectedLines: 15 };

  it("returns one checklist row per rubric item, in the order sent", async () => {
    vi.stubGlobal("fetch", reply({
      correct: true, score: 90,
      meets: [{ requirement: "r2", met: true, note: "yes" }, { requirement: "r1", met: false, note: "no" }],
      conciseness: "About right.", feedback: "Good.",
    }));
    const g = await gradeCode({ ...base, code: "int a = 1;" });
    // Matched by text, not position — the model reordered them.
    expect(g.meets.map((m) => [m.requirement, m.met])).toEqual([["r1", false], ["r2", true]]);
  });

  it("fills in missing checklist rows as not-met rather than dropping them", async () => {
    vi.stubGlobal("fetch", reply({ correct: false, score: 40, meets: [], conciseness: "", feedback: "" }));
    const g = await gradeCode({ ...base, code: "x" });
    expect(g.meets).toHaveLength(2);
    expect(g.meets.every((m) => m.met === false)).toBe(true);
  });

  it("computes the conciseness counts itself instead of trusting the model", async () => {
    vi.stubGlobal("fetch", reply({ correct: true, score: 80, meets: [], conciseness: "Long.", feedback: "" }));
    const g = await gradeCode({ ...base, code: "a\nb\nc\n\n// c\nd" });
    expect(g.conciseness).toMatchObject({ expected: 15, actual: 4, note: "Long." });
  });

  it("clamps a nonsense score into range", async () => {
    vi.stubGlobal("fetch", reply({ correct: true, score: 5000, meets: [], conciseness: "", feedback: "" }));
    expect((await gradeCode({ ...base, code: "x" })).score).toBe(100);
  });

  it("derives correct from the checklist when the model omits it", async () => {
    vi.stubGlobal("fetch", reply({
      score: 100,
      meets: [{ requirement: "r1", met: true, note: "" }, { requirement: "r2", met: true, note: "" }],
      conciseness: "", feedback: "",
    }));
    expect((await gradeCode({ ...base, code: "x" })).correct).toBe(true);
  });
});

describe("coding routes", () => {
  it("both require a token", async () => {
    for (const path of ["/v1/coding-task", "/v1/coding-grade"]) {
      const res = await app.request(path, {
        method: "POST", headers: { "content-type": "application/json" }, body: "{}",
      });
      expect(res.status).toBe(401);
    }
  });

  it("rejects a submission over the 4000-character cap with 400", async () => {
    // The panel disables submit at this size; this is the server half of that,
    // since the client is never trusted.
    const res = await post("/v1/coding-grade", {
      task: "t", rubric: ["r"], language: "java", expectedLines: 15, code: "x".repeat(4001),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("validation");
  });

  it("accepts a submission at exactly the cap", async () => {
    vi.stubGlobal("fetch", reply({ correct: true, score: 90, meets: [], conciseness: "", feedback: "ok" }));
    const res = await post("/v1/coding-grade", {
      task: "t", rubric: ["r"], language: "java", expectedLines: 15, code: "x".repeat(4000),
    });
    expect(res.status).toBe(200);
  });

  it("surfaces a provider outage as 502 llm_error, not a bare 500", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "upstream down" } }), { status: 500 })
    ));
    const res = await post("/v1/coding-task", { concept: "C", reference: "R" });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("llm_error");
  });

  it("returns a normalised task over HTTP", async () => {
    vi.stubGlobal("fetch", reply(TASK));
    const res = await post("/v1/coding-task", { concept: "Encapsulation", reference: "Private fields." });
    expect(res.status).toBe(200);
    const t = await res.json();
    expect(t.starter).toContain("BankAccount");
    expect(t.rubric).toHaveLength(2);
  });
});
