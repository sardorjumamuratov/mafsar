import { describe, expect, test, vi } from "vitest";
import { estimationTaskSchema, estimationSummarySchema } from "../src/schema.js";

describe("Estimation mode schemas", () => {
  test("estimationTaskSchema validates correct input", () => {
    const input = { concept: "URL shortener", reference: [{ front: "A", back: "B" }] };
    expect(() => estimationTaskSchema.parse(input)).not.toThrow();
  });

  test("estimationSummarySchema validates correct input", () => {
    const input = { results: [{ question: "A", expected: "10 GB", answer: "10", grade: "spot_on" }] };
    expect(() => estimationSummarySchema.parse(input)).not.toThrow();
  });
});
