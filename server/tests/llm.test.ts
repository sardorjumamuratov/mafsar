import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  extractJson, generateStudySet, gradeAnswer, generateHypothetical, summarizeConversation, setBlurb,
} from "../src/llm.js";

// The provider fetch is mocked; these tests cover prompt plumbing, JSON
// parsing, and normalization — not real API calls.

const ok = (payload: unknown) => {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload);
  const body = JSON.stringify({ candidates: [{ content: { parts: [{ text: text }] } }] });
  return vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
};

beforeEach(() => {
  process.env.LLM_PROVIDER = "gemini";
  process.env.LLM_API_KEY = "test-key";
  process.env.LLM_MODEL = "";
});

describe("extractJson", () => {
  it("parses plain and fenced JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(extractJson('noise before {"a":3} after')).toEqual({ a: 3 });
  });
  it("throws when there is no object", () => {
    expect(() => extractJson("no json here")).toThrow();
  });
});

describe("generateStudySet", () => {
  it("normalizes and ids cards + quiz", async () => {
    vi.stubGlobal("fetch", ok({
      flashcards: [
        { front: "Q", back: "A" },
        { front: "", back: "dropped" }, // invalid -> filtered
      ],
      quiz: [
        { q: "2+2?", options: ["3", "4", "5", "6"], answer: 1, explain: "math" },
        { q: "bad", options: ["only"], answer: 9 }, // <2 options -> filtered
      ],
    }));
    const out = await generateStudySet([{ role: "user", text: "hi" }]);
    expect(out.flashcards).toHaveLength(1);
    expect(out.flashcards[0].id).toBeTruthy();
    expect(out.quiz).toHaveLength(1);
    expect(out.quiz[0].answer).toBe(1);
    vi.unstubAllGlobals();
  });

  it("retries once on malformed JSON then errors", async () => {
    vi.stubGlobal("fetch", ok("total garbage"));
    await expect(generateStudySet([{ role: "user", text: "hi" }])).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it("throws a clear error when the key is missing", async () => {
    process.env.LLM_API_KEY = "";
    await expect(generateStudySet([{ role: "user", text: "hi" }])).rejects.toThrow("LLM_API_KEY");
  });
});

describe("gradeAnswer", () => {
  it("clamps score 0..100 and defaults correct at >=60", async () => {
    vi.stubGlobal("fetch", ok({ score: 150, feedback: "good" }));
    const g = await gradeAnswer("q", "ref", "ans");
    expect(g.score).toBe(100);
    expect(g.correct).toBe(true);
    vi.unstubAllGlobals();
  });

  it("keeps an explicit correct=false even with a high score", async () => {
    vi.stubGlobal("fetch", ok({ score: 90, correct: false, feedback: "" }));
    const g = await gradeAnswer("q", "ref", "ans");
    expect(g.correct).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe("generateHypothetical / summarizeConversation", () => {
  it("returns scenario + rubric", async () => {
    vi.stubGlobal("fetch", ok({ scenario: "S?", rubric: "R" }));
    const h = await generateHypothetical("c", "r");
    expect(h).toEqual({ scenario: "S?", rubric: "R" });
    vi.unstubAllGlobals();
  });

  it("caps keyPoints at 6", async () => {
    vi.stubGlobal("fetch", ok({ summary: "s", keyPoints: ["1", "2", "3", "4", "5", "6", "7", "8"] }));
    const s = await summarizeConversation([{ role: "user", text: "x" }]);
    expect(s.keyPoints).toHaveLength(6);
    vi.unstubAllGlobals();
  });
});

describe("setBlurb", () => {
  it("trims quotes/periods and caps the word count", async () => {
    vi.stubGlobal("fetch", ok({ blurb: '"Torts: negligence and duty of care in common law systems today."' }));
    const { blurb } = await setBlurb("Torts", ["Elements of negligence", "Duty of care"]);
    expect(blurb.startsWith("Torts")).toBe(true);
    expect(blurb.endsWith(".")).toBe(false);
    expect(blurb.split(/\s+/).length).toBeLessThanOrEqual(8);
    vi.unstubAllGlobals();
  });

  it("throws on an empty blurb", async () => {
    vi.stubGlobal("fetch", ok({ blurb: "" }));
    await expect(setBlurb("T", ["a"])).rejects.toThrow("empty blurb");
    vi.unstubAllGlobals();
  });
});
