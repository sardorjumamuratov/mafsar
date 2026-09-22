import { describe, expect, test, vi } from "vitest";
import { designTaskSchema, designGradeSchema, designCurveballSchema } from "../src/schema.js";

describe("Design mode schemas", () => {
  test("designTaskSchema validates correct input", () => {
    const input = { concept: "URL shortener", reference: [{ front: "A", back: "B" }] };
    expect(() => designTaskSchema.parse(input)).not.toThrow();
  });

  test("designTaskSchema rejects long inputs", () => {
    const input = { concept: "A".repeat(1000), reference: [] };
    expect(() => designTaskSchema.parse(input)).toThrow();
  });

  test("designGradeSchema caps answers", () => {
    const input = { task: "A", answer: "A".repeat(5000) };
    expect(() => designGradeSchema.parse(input)).toThrow();
  });
});
