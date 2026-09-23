import { describe, it, expect } from "vitest";
import {
  MAX_STUDENT_TURNS, buildTurnPrompt, nextHintLevel, normalizeEvaluation, normalizeTurn,
  type TeachMessage, type TeachTurnInput,
} from "../src/teach.js";

const cards = [
  { id: "c1", front: "What photosynthesis produces", back: "Glucose and oxygen, made from light, water and carbon dioxide." },
  { id: "c2", front: "Where it happens", back: "In chloroplasts, using the pigment chlorophyll." },
];
const input = (messages: TeachMessage[], extra: Partial<TeachTurnInput> = {}): TeachTurnInput => ({
  topic: "Photosynthesis", persona: "child", cards, messages, wantHint: false, ...extra,
});
const L = (text: string): TeachMessage => ({ role: "learner", text });
const S = (kind: NonNullable<TeachMessage["kind"]>, focusCardId: string, text = "…"): TeachMessage => ({
  role: "student", text, kind, focusCardId,
});
const studentTurns = (n: number): TeachMessage[] =>
  Array.from({ length: n }, (_, i) => [L(`explanation ${i}`), S("question", "c1")]).flat();

describe("nextHintLevel", () => {
  it("starts at level 1", () => {
    expect(nextHintLevel([L("x")], "c1")).toBe(1);
  });

  it("counts only hints already given for that idea", () => {
    const messages = [L("a"), S("hint", "c1"), L("b"), S("hint", "c2"), L("c")];
    expect(nextHintLevel(messages, "c1")).toBe(2);
    expect(nextHintLevel(messages, "c2")).toBe(2);
  });

  it("never goes above level 3", () => {
    const messages = [L("a"), S("hint", "c1"), L("b"), S("hint", "c1"), L("c"), S("hint", "c1"), L("d"), S("hint", "c1"), L("e")];
    expect(nextHintLevel(messages, "c1")).toBe(3);
  });

  it("an unknown idea starts at level 1", () => {
    expect(nextHintLevel([L("a"), S("hint", "c1")], undefined)).toBe(1);
  });
});

describe("buildTurnPrompt", () => {
  it("gives the student the notes but forbids revealing them", () => {
    const { system } = buildTurnPrompt(input([L("Plants make food from light.")]));
    expect(system).toContain(cards[0].back);
    expect(system).toMatch(/never quote, reveal/i);
  });

  it("plays the chosen persona", () => {
    expect(buildTurnPrompt(input([L("x")])).system).toContain("12-year-old");
    expect(buildTurnPrompt(input([L("x")], { persona: "beginner" })).system).toContain("complete beginner");
  });

  it("plays the worried patient, who asks what patients ask", () => {
    const { system } = buildTurnPrompt(input([L("x")], { persona: "patient" }));
    expect(system).toContain("worried patient");
    expect(system).toMatch(/side effects/i);
  });

  it("'I'm stuck' asks for a hint at the level the server computed", () => {
    const messages = [L("It makes food."), S("hint", "c1"), L("I don't know")];
    const { system, user } = buildTurnPrompt(input(messages, { wantHint: true }));
    expect(user).toContain("I'm stuck");
    expect(user).toContain("level 2");
    expect(system).toContain("must be level 2");
  });

  it("tells the student to wrap up only on the last allowed reply", () => {
    const last = buildTurnPrompt(input([...studentTurns(MAX_STUDENT_TURNS - 1), L("final")])).system;
    const early = buildTurnPrompt(input([L("first")])).system;
    expect(last).toContain("This is your last reply");
    expect(early).not.toContain("This is your last reply");
  });
});

describe("normalizeTurn", () => {
  it("fills in missing coverage and ignores unknown ideas", () => {
    const t = normalizeTurn({ reply: "Why?", kind: "question", focusCardId: "c1", coverage: { c1: "partial", zzz: "covered" } }, input([L("x")]));
    expect(t.coverage).toEqual({ c1: "partial", c2: "not_yet" });
  });

  it("an invalid focus falls back to the first idea not yet covered", () => {
    const t = normalizeTurn({ reply: "Why?", kind: "question", focusCardId: "nope", coverage: { c1: "covered" } }, input([L("x")]));
    expect(t.focusCardId).toBe("c2");
  });

  it("'I'm stuck' always produces a hint, at the level computed from history", () => {
    const messages = [L("a"), S("hint", "c2"), L("no idea")];
    const t = normalizeTurn({ reply: "Think about leaves…", kind: "question", focusCardId: "c2", coverage: {} }, input(messages, { wantHint: true }));
    expect(t.kind).toBe("hint");
    expect(t.hintLevel).toBe(2);
  });

  it("ends with a wrap-up once every idea is covered", () => {
    const t = normalizeTurn({ reply: "Thanks!", kind: "question", focusCardId: "c1", coverage: { c1: "covered", c2: "covered" } }, input([L("x")]));
    expect(t.done).toBe(true);
    expect(t.kind).toBe("wrap_up");
    expect(t.hintLevel).toBe(0);
  });

  it("the last allowed reply always ends the session", () => {
    const t = normalizeTurn({ reply: "OK!", kind: "question", focusCardId: "c1", coverage: {} }, input([...studentTurns(MAX_STUDENT_TURNS - 1), L("x")]));
    expect(t.done).toBe(true);
  });

  it("an empty reply is an LLM error", () => {
    let error: any;
    try {
      normalizeTurn({ reply: "   " }, input([L("x")]));
    } catch (e) {
      error = e;
    }
    expect(error?.name).toBe("LLMError");
  });

  it("clips a rambling reply", () => {
    const t = normalizeTurn({ reply: "a".repeat(2000), coverage: {} }, input([L("x")]));
    expect(t.reply.length).toBe(600);
  });
});

describe("normalizeEvaluation", () => {
  const evalInput = (messages: TeachMessage[]) => ({ topic: "Photosynthesis", persona: "child" as const, cards, messages });

  it("downgrades 'taught' to 'taught_with_hints' when hints were given on that idea", () => {
    const e = normalizeEvaluation(
      { ideas: [{ cardId: "c1", status: "taught", note: "Good" }, { cardId: "c2", status: "taught" }] },
      evalInput([L("a"), S("hint", "c1"), L("b")])
    );
    expect(e.ideas[0]).toMatchObject({ cardId: "c1", status: "taught_with_hints", hints: 1, front: cards[0].front });
    expect(e.ideas[1]).toMatchObject({ cardId: "c2", status: "taught", hints: 0 });
  });

  it("missing or invalid statuses count as not covered", () => {
    const e = normalizeEvaluation({ ideas: [{ cardId: "c1", status: "amazing" }] }, evalInput([L("a"), L("b")]));
    expect(e.ideas.map((i) => i.status)).toEqual(["not_covered", "not_covered"]);
  });

  it("completeness is counted from the ideas, not taken from the model", () => {
    const e = normalizeEvaluation(
      { scores: { completeness: 100 }, ideas: [{ cardId: "c1", status: "taught" }, { cardId: "c2", status: "not_covered" }] },
      evalInput([L("a"), L("b")])
    );
    expect(e.scores.completeness).toBe(50);
  });

  it("reassurance is scored for the patient and left off everyone else", () => {
    const patient = normalizeEvaluation(
      { scores: { reassurance: 80 }, ideas: [{ cardId: "c1", status: "taught" }] },
      { ...evalInput([L("a"), L("b")]), persona: "patient" as const }
    );
    expect(patient.scores.reassurance).toBe(80);
    const child = normalizeEvaluation(
      { scores: { reassurance: 80 }, ideas: [{ cardId: "c1", status: "taught" }] },
      evalInput([L("a"), L("b")])
    );
    expect(child.scores.reassurance).toBeUndefined();
  });

  it("clamps scores and caps jargon at five", () => {
    const e = normalizeEvaluation(
      { scores: { accuracy: 150, simplicity: -5, understanding: "abc" }, jargon: [" a ", "b", "", "c", "d", "e", "f"] },
      evalInput([L("a"), L("b")])
    );
    expect(e.scores.accuracy).toBe(100);
    expect(e.scores.simplicity).toBe(0);
    expect(e.scores.understanding).toBe(0);
    expect(e.jargon).toEqual(["a", "b", "c", "d", "e"]);
  });
});
