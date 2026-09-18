import { describe, it, expect } from "vitest";
import { PRIVACY_HTML } from "../src/privacy.js";

// The policy must describe what the product actually does. Whitespace is
// collapsed so line wrapping in the source can't hide a phrase.
const text = PRIVACY_HTML.replace(/\s+/g, " ");

describe("privacy policy", () => {
  it("does not claim Mafsar works without an account", () => {
    expect(text).not.toMatch(/works fully offline/i);
    expect(text).not.toMatch(/only needed if/i);
    expect(text).not.toMatch(/never create an account/i);
    expect(text).toMatch(/requires a free account/i);
  });

  it("names the AI service production actually uses", () => {
    expect(text).toContain("OpenRouter");
    expect(text).not.toContain("Groq");
  });
});

