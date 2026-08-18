import { describe, it, expect, beforeEach, vi } from "vitest";
import { LLMError, generateStudySet } from "../src/llm.js";

// The provider adapters were the largest untested surface: only the default
// (gemini) happy path ran. A wrong URL, header, or response-shape reader here
// takes down every generation for a whole deployment, and the failure only
// shows up in production because each provider is selected by env var.

const STUDY_JSON = JSON.stringify({
  flashcards: [{ front: "F", back: "B" }],
  quiz: [{ q: "Q", options: ["a", "b", "c", "d"], answer: 1, explain: "E" }],
});

/** Capture the outbound request the adapter builds. */
function captureFetch(responseBody: string, status = 200) {
  const spy = vi.fn().mockResolvedValue(new Response(responseBody, { status }));
  vi.stubGlobal("fetch", spy);
  return spy;
}

beforeEach(() => {
  process.env.LLM_API_KEY = "test-key";
  process.env.LLM_MODEL = "";
  vi.unstubAllGlobals();
});

describe("provider adapters", () => {
  it("gemini: posts to the model URL with the key header and reads candidates[].parts", async () => {
    process.env.LLM_PROVIDER = "gemini";
    const spy = captureFetch(JSON.stringify({ candidates: [{ content: { parts: [{ text: STUDY_JSON }] } }] }));

    const out = await generateStudySet([{ role: "user", text: "hello" }]);

    const [url, init] = spy.mock.calls[0];
    expect(url).toContain("generativelanguage.googleapis.com");
    expect(url).toContain(":generateContent");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
    expect(out.flashcards).toHaveLength(1);
  });

  it("groq: posts OpenAI-shaped chat completions with a bearer token", async () => {
    process.env.LLM_PROVIDER = "groq";
    const spy = captureFetch(JSON.stringify({ choices: [{ message: { content: STUDY_JSON } }] }));

    const out = await generateStudySet([{ role: "user", text: "hello" }]);

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer test-key");
    const body = JSON.parse(init.body as string);
    expect(body.messages.map((m: any) => m.role)).toEqual(["system", "user"]);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(out.quiz[0].options).toHaveLength(4);
  });

  it("anthropic: sends x-api-key + version and reads only text blocks", async () => {
    process.env.LLM_PROVIDER = "anthropic";
    const spy = captureFetch(
      JSON.stringify({ content: [{ type: "thinking", text: "ignore me" }, { type: "text", text: STUDY_JSON }] })
    );

    const out = await generateStudySet([{ role: "user", text: "hello" }]);

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("test-key");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    // Non-text blocks must be dropped, or extractJson parses the wrong block.
    expect(out.flashcards[0].front).toBe("F");
  });

  // Guards the truncation fix: a 40-card set plus a question each is ~8k
  // tokens of JSON. At the old 4096 cap the response was cut mid-object and
  // surfaced as a parse failure, not as a short set.
  it.each([
    ["groq", "max_completion_tokens", (b: any) => b.max_completion_tokens],
    ["anthropic", "max_tokens", (b: any) => b.max_tokens],
    ["gemini", "maxOutputTokens", (b: any) => b.generationConfig.maxOutputTokens],
  ])("%s requests a large enough output budget (%s)", async (provider, _field, read) => {
    process.env.LLM_PROVIDER = provider;
    const payload =
      provider === "gemini"
        ? JSON.stringify({ candidates: [{ content: { parts: [{ text: STUDY_JSON }] } }] })
        : provider === "groq"
        ? JSON.stringify({ choices: [{ message: { content: STUDY_JSON } }] })
        : JSON.stringify({ content: [{ type: "text", text: STUDY_JSON }] });
    const spy = captureFetch(payload);

    await generateStudySet([{ role: "user", text: "hello" }]);

    expect(read(JSON.parse(spy.mock.calls[0][1].body as string))).toBeGreaterThanOrEqual(16384);
  });
});

describe("provider failures", () => {
  it("surfaces the provider's own error message, not a bare 'internal'", async () => {
    // The real outage this covers: Groq decommissioned a model and the API
    // returned {"error":{"message":"model ... decommissioned"}} — the server
    // swallowed it and every client saw an opaque 500.
    process.env.LLM_PROVIDER = "groq";
    captureFetch(JSON.stringify({ error: { message: "model `x` has been decommissioned" } }), 400);

    await expect(generateStudySet([{ role: "user", text: "hi" }])).rejects.toThrow(/decommissioned/);
  });

  it("throws LLMError (not a plain Error) so the API can map it to 502", async () => {
    process.env.LLM_PROVIDER = "gemini";
    captureFetch(JSON.stringify({ error: { message: "quota exceeded" } }), 429);

    const err = await generateStudySet([{ role: "user", text: "hi" }]).catch((e) => e);
    expect(err).toBeInstanceOf(LLMError);
    expect(err.status).toBeGreaterThanOrEqual(500);
  });

  it("rejects an unknown LLM_PROVIDER instead of silently using a default", async () => {
    process.env.LLM_PROVIDER = "not-a-provider";
    captureFetch(JSON.stringify({}));

    await expect(generateStudySet([{ role: "user", text: "hi" }])).rejects.toThrow();
  });

  it("fails clearly when the response body is not JSON at all", async () => {
    // Proxies and gateways return HTML error pages; res.json() throws and the
    // user must not see an unhandled rejection.
    process.env.LLM_PROVIDER = "groq";
    captureFetch("<html>502 Bad Gateway</html>", 200);

    await expect(generateStudySet([{ role: "user", text: "hi" }])).rejects.toThrow();
  });
});
