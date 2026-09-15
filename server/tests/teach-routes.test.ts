import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../src/teach.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/teach.js")>();
  return { ...actual, teachTurn: vi.fn(), evaluateTeaching: vi.fn() };
});

import { openDB, migrate, all, type DB } from "../src/db.js";
import { createApp } from "../src/app.js";
import { register, signAccessToken } from "../src/auth.js";
import { MAX_STUDENT_TURNS, evaluateTeaching, teachTurn } from "../src/teach.js";

let db: DB;
let app: ReturnType<typeof createApp>;
let token: string;
let userId: string;

beforeEach(async () => {
  db = openDB(":memory:");
  await migrate(db);
  app = createApp(db);
  const user = (await register(db, "teacher@mafsar.dev", "password123"))!;
  userId = user.id;
  token = await signAccessToken(user.id);
  vi.mocked(teachTurn).mockReset();
  vi.mocked(evaluateTeaching).mockReset();
});
afterEach(() => {
  delete process.env.FREE_PRACTICE_LIMIT;
});

const cards = [{ id: "c1", front: "Photosynthesis", back: "Plants turn light, water and CO2 into sugar and oxygen." }];
const turnReply = { reply: "What's CO2?", kind: "question", focusCardId: "c1", hintLevel: 0, coverage: { c1: "partial" }, done: false };
const first = [{ role: "learner", text: "Plants make food from light." }];
const later = [...first, { role: "student", text: "How?", kind: "question", focusCardId: "c1" }, { role: "learner", text: "Using chlorophyll." }];

const call = (path: string, messages: unknown[], extra: Record<string, unknown> = {}, t = token) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) },
    body: JSON.stringify({ topic: "Biology", persona: "child", cards, messages, ...extra }),
  });
const practiceUnits = async () =>
  (await all(db, "SELECT id FROM generation_events WHERE user_id = ? AND category = 'practice'", [userId])).length;

describe("POST /v1/teach/turn", () => {
  it("requires a token", async () => {
    expect((await call("/v1/teach/turn", first, {}, "")).status).toBe(401);
  });

  it("charges one practice unit for the first turn only", async () => {
    vi.mocked(teachTurn).mockResolvedValue(turnReply as any);
    expect((await call("/v1/teach/turn", first)).status).toBe(200);
    expect(await practiceUnits()).toBe(1);
    expect((await call("/v1/teach/turn", later)).status).toBe(200);
    expect(await practiceUnits()).toBe(1);
  });

  it("returns the student's turn", async () => {
    vi.mocked(teachTurn).mockResolvedValue(turnReply as any);
    expect(await (await call("/v1/teach/turn", first)).json()).toEqual(turnReply);
  });

  it("refuses to start a session when the practice quota is used up", async () => {
    process.env.FREE_PRACTICE_LIMIT = "0";
    const res = await call("/v1/teach/turn", first);
    expect(res.status).toBe(402);
    expect((await res.json()).error).toBe("quota_exceeded");
    expect(teachTurn).not.toHaveBeenCalled();
  });

  it("a session already under way keeps going when the quota runs out", async () => {
    process.env.FREE_PRACTICE_LIMIT = "0";
    vi.mocked(teachTurn).mockResolvedValue(turnReply as any);
    expect((await call("/v1/teach/turn", later)).status).toBe(200);
  });

  it("refunds the unit when the first turn's model call fails", async () => {
    vi.mocked(teachTurn).mockRejectedValue(Object.assign(new Error("provider down"), { name: "LLMError" }));
    expect((await call("/v1/teach/turn", first)).status).toBe(502);
    expect(await practiceUnits()).toBe(0);
  });

  it("refuses a session past the turn cap, without charging", async () => {
    const messages = [
      ...Array.from({ length: MAX_STUDENT_TURNS }, (_, i) => [
        { role: "learner", text: `explanation ${i}` },
        { role: "student", text: "and?", kind: "question", focusCardId: "c1" },
      ]).flat(),
      { role: "learner", text: "more" },
    ];
    const res = await call("/v1/teach/turn", messages);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("too_many_turns");
    expect(teachTurn).not.toHaveBeenCalled();
  });

  it("the last message must be the learner's", async () => {
    const res = await call("/v1/teach/turn", [...first, { role: "student", text: "Hi", kind: "question", focusCardId: "c1" }]);
    expect(res.status).toBe(400);
  });

  it("is rate-limited per user", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 151; i++) {
      codes.push((await app.request("/v1/teach/turn", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: "{}" })).status);
    }
    expect(codes[150]).toBe(429);
  });
});

describe("POST /v1/teach/evaluate", () => {
  it("returns the evaluation and charges nothing", async () => {
    const evaluation = { scores: { accuracy: 80, completeness: 100, simplicity: 70, understanding: 75 }, ideas: [], jargon: [], strengths: "", improve: "", modelExplanation: "" };
    vi.mocked(evaluateTeaching).mockResolvedValue(evaluation as any);
    const res = await call("/v1/teach/evaluate", later);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(evaluation);
    expect(await practiceUnits()).toBe(0);
  });
});
