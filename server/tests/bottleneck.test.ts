import { describe, expect, test, vi } from "vitest";
import { bottleneckTaskSchema, bottleneckHintSchema, bottleneckGradeSchema } from "../src/schema.js";

describe("Bottleneck mode schemas", () => {
  test("bottleneckTaskSchema validates correct input", () => {
    const input = { concept: "URL shortener", reference: [{ front: "A", back: "B" }] };
    expect(() => bottleneckTaskSchema.parse(input)).not.toThrow();
  });

  test("bottleneckHintSchema validates correct input", () => {
    const input = { state: "abcd" };
    expect(() => bottleneckHintSchema.parse(input)).not.toThrow();
  });
  
  test("bottleneckGradeSchema validates correct input", () => {
    const input = { state: "abcd", answer: "Something breaks" };
    expect(() => bottleneckGradeSchema.parse(input)).not.toThrow();
  });
});
