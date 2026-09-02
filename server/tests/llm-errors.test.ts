// Every LLM failure that can reach a route handler must be an LLMError, so
// app.ts maps it to 502 llm_error with the reason attached. A plain Error
// falls through to the generic handler and the user sees only "internal" —
// which is exactly what "it just doesn't generate flashcards" looks like.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LLMError, extractJson } from "../src/llm.js";

const SRC = readFileSync(join(__dirname, "../src/llm.ts"), "utf8");

describe("LLM errors are actionable, not opaque", () => {
  it("LLMError carries name and a 502 default so app.ts can route it", () => {
    const e = new LLMError("boom");
    expect(e.name).toBe("LLMError");
    expect(e.status).toBe(502);
    expect(new LLMError("boom", 503).status).toBe(503);
  });

  it("no throw that escapes to a route handler uses a bare Error", () => {
    // extractJson's throw is the one permitted plain Error: callJson catches it
    // to drive its retry, so it never reaches the handler.
    const bare = SRC.split("\n")
      .map((line, i) => ({ line: line.trim(), no: i + 1 }))
      .filter((l) => l.line.includes("throw new Error("))
      .filter((l) => !l.line.includes("No JSON object in model response"));

    expect(
      bare,
      `these throws would surface to the client as a bare 500 "internal":\n` +
        bare.map((l) => `  llm.ts:${l.no}  ${l.line}`).join("\n")
    ).toEqual([]);
  });

  it("the specific failures that broke generation are LLMError", () => {
    for (const msg of [
      "Generation failed:",
      "Couldn't parse model response:",
      "Model returned an incomplete exercise.",
      "Model returned an empty blurb.",
    ]) {
      const idx = SRC.indexOf(msg);
      expect(idx, `${msg} not found in llm.ts`).toBeGreaterThan(-1);
      const stmtStart = SRC.lastIndexOf("throw new", idx);
      expect(
        SRC.slice(stmtStart, idx).includes("LLMError"),
        `"${msg}" must throw LLMError, not Error`
      ).toBe(true);
    }
  });

  it("extractJson still throws plainly — callJson relies on catching it", () => {
    expect(() => extractJson("no json here")).toThrow(/No JSON object/);
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
});
