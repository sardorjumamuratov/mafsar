import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { openDB, migrate, type DB } from "../src/db.js";
import { createApp } from "../src/app.js";
import { register, signAccessToken } from "../src/auth.js";
import { normalizeChains, studyMode } from "../src/llm.js";

// Mode-aware generation (design + medicine) and mechanism-chain sync. The
// published extension sends no mode and no chains: it must get exactly the old
// behaviour.

let db: DB;
let app: ReturnType<typeof createApp>;
let tokenA: string;
let tokenB: string;

const reply = (payload: unknown) =>
  vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }), { status: 200 })
  );
const CARDS = { flashcards: [{ front: "Q", back: "A" }], quiz: [], mode: "general" };

beforeEach(async () => {
  db = openDB(":memory:");
  await migrate(db);
  app = createApp(db);
  tokenA = await signAccessToken((await register(db, "a@mafsar.dev", "password123"))!.id);
  tokenB = await signAccessToken((await register(db, "b@mafsar.dev", "password123"))!.id);
  process.env.LLM_PROVIDER = "gemini";
  process.env.LLM_API_KEY = "test-key";
  process.env.LLM_MODEL = "";
});
afterEach(() => vi.unstubAllGlobals());

const post = (path: string, body: unknown, token = tokenA) =>
  app.request(path, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const generate = (mode?: string) =>
  post("/v1/generate", { messages: [{ role: "user", text: "Explain asthma" }], ...(mode ? { mode } : {}) });

describe("mode-aware generation", () => {
  it("unknown or missing modes are general", () => {
    expect(studyMode(undefined)).toBe("general");
    expect(studyMode("hacker")).toBe("general");
    expect(studyMode("medicine")).toBe("medicine");
  });

  it("an old client (no mode) gets the base prompt, no chains, and the medical hint", async () => {
    const fetchMock = reply({ ...CARDS, medical: true });
    vi.stubGlobal("fetch", fetchMock);
    const body = await (await generate()).json();
    const sent = JSON.stringify(fetchMock.mock.calls[0][1]);
    expect(sent).not.toContain("SYSTEM DESIGN");
    expect(sent).not.toContain("MEDICINE");
    expect(body.mode).toBe("general");
    expect(body.suggestMedicine).toBe(true);
    expect(body).not.toHaveProperty("chains");
  });

  it("the medical hint is only true when the model says so", async () => {
    vi.stubGlobal("fetch", reply({ ...CARDS, medical: "yes" }));
    expect((await (await generate()).json()).suggestMedicine).toBe(false);
  });

  it("medicine sets get chain instructions and normalised chains", async () => {
    const fetchMock = reply({
      ...CARDS,
      chains: [{
        title: "Asthma",
        steps: [
          { key: "treatment", statement: "Bronchodilator", why: "" },
          { key: "cause", statement: "Allergen", why: "" },
          { key: "vibes", statement: "not a step", why: "" },
          { key: "cause", statement: "duplicate", why: "" },
          { key: "signs", statement: "", why: "" },
        ],
      }],
    });
    vi.stubGlobal("fetch", fetchMock);
    const body = await (await generate("medicine")).json();
    const sent = JSON.stringify(fetchMock.mock.calls[0][1]);
    expect(sent).toContain("This is a MEDICINE set");
    expect(sent).toContain("Use ONLY what the source states");
    expect(body.mode).toBe("medicine");
    expect(body.suggestMedicine).toBe(false);
    expect(body.chains).toEqual([{
      title: "Asthma",
      steps: [
        { key: "cause", statement: "Allergen", why: "" },
        { key: "treatment", statement: "Bronchodilator", why: "" },
      ],
    }]);
  });

  it("design sets get the trade-off card style and keep their mode", async () => {
    const fetchMock = reply(CARDS);
    vi.stubGlobal("fetch", fetchMock);
    const body = await (await generate("design")).json();
    expect(JSON.stringify(fetchMock.mock.calls[0][1])).toContain("SYSTEM DESIGN");
    expect(body.mode).toBe("design");
  });
});

describe("normalizeChains", () => {
  it("drops untitled chains and chains with fewer than two steps, caps the count", () => {
    const step = (key: string) => ({ key, statement: key, why: "" });
    expect(normalizeChains([{ title: "", steps: [step("cause"), step("tests")] }])).toEqual([]);
    expect(normalizeChains([{ title: "X", steps: [step("cause")] }])).toEqual([]);
    const many = Array.from({ length: 12 }, (_, i) => ({ title: `C${i}`, steps: [step("cause"), step("tests")] }));
    expect(normalizeChains(many)).toHaveLength(8);
    expect(normalizeChains("junk")).toEqual([]);
  });
});

describe("chain sync", () => {
  const T = "2026-09-01T10:00:00.000Z";
  const set = { id: "s1", title: "Respiratory", createdAt: T, updatedAt: T };
  const chain = { id: "ch1", setId: "s1", template: "medicine-condition", title: "Asthma", updatedAt: T };
  const step = { id: "st1", chainId: "ch1", key: "cause", statement: "Allergen", why: "", edited: true, updatedAt: T };

  it("round-trips chains and steps, including the edited flag", async () => {
    expect((await post("/v1/sync", { sets: [set], chains: [chain], chainSteps: [step] })).status).toBe(200);
    const out = await (await post("/v1/sync", {})).json();
    expect(out.chains).toEqual([{ ...chain, deleted: false }]);
    expect(out.chainSteps).toEqual([{ ...step, deleted: false }]);
  });

  it("an old client that sends no chains still syncs", async () => {
    const res = await post("/v1/sync", { sets: [set] });
    expect(res.status).toBe(200);
    expect((await res.json()).chains).toEqual([]);
  });

  it("one user can't write steps into another user's chain", async () => {
    await post("/v1/sync", { sets: [set], chains: [chain], chainSteps: [step] });
    await post("/v1/sync", { chainSteps: [{ ...step, id: "evil", statement: "hijacked" }] }, tokenB);
    const a = await (await post("/v1/sync", {})).json();
    expect(a.chainSteps.map((s: any) => s.id)).toEqual(["st1"]);
    const b = await (await post("/v1/sync", {}, tokenB)).json();
    expect(b.chainSteps).toEqual([]);
  });

  it("last write wins, and tombstones propagate", async () => {
    await post("/v1/sync", { sets: [set], chains: [chain], chainSteps: [step] });
    const later = "2026-09-02T10:00:00.000Z";
    await post("/v1/sync", { chainSteps: [{ ...step, deleted: true, updatedAt: later }] });
    await post("/v1/sync", { chainSteps: [{ ...step, statement: "stale", updatedAt: T }] });
    const out = await (await post("/v1/sync", {})).json();
    expect(out.chainSteps[0]).toMatchObject({ deleted: true, statement: "Allergen" });
  });

  it("rejects oversized chain text", async () => {
    const res = await post("/v1/sync", { sets: [set], chains: [chain], chainSteps: [{ ...step, statement: "x".repeat(1001) }] });
    expect(res.status).toBe(400);
  });
});
