// Mechanism chains (Medicine mode). Run: node tests/chains.test.mjs
//
// Tests the real module the worker and the editor use, not a copy.
import assert from "node:assert/strict";
import {
  DEFAULT_TEMPLATE, chainCoverage, editStep, liveChains, mergeChains, orderedSteps, stepLabel, templateSteps,
} from "../src/storage/chains.js";
import { applyServer, toServer } from "../shared/sync-map.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}
let n = 0;
const uid = () => `id${++n}`;
const T1 = "2026-09-01T00:00:00.000Z";
const T2 = "2026-09-02T00:00:00.000Z";

const asthma = {
  title: "Asthma",
  steps: [
    { key: "cause", statement: "Allergen or trigger", why: "" },
    { key: "mechanism", statement: "Airway inflammation", why: "The trigger activates immune cells." },
    { key: "treatment", statement: "Bronchodilator + inhaled steroid", why: "" },
  ],
};

console.log("template");
test("the medicine template has the eight steps in order", () => {
  assert.deepEqual(templateSteps(DEFAULT_TEMPLATE).map((s) => s.key),
    ["cause", "mechanism", "physiological", "symptoms", "signs", "tests", "diagnosis", "treatment"]);
  assert.equal(stepLabel(DEFAULT_TEMPLATE, "physiological"), "Physiological change");
});
test("gaps show as null steps, and coverage counts only filled ones", () => {
  const [ch] = mergeChains([], [asthma], { uid, now: T1 });
  const rows = orderedSteps(ch);
  assert.equal(rows.length, 8);
  assert.equal(rows.find((r) => r.key === "tests").step, null);
  assert.deepEqual(chainCoverage(ch), { filled: 3, total: 8 });
});

console.log("merging on regeneration");
test("new chains get ids, the default template and timestamps", () => {
  const [ch] = mergeChains([], [asthma], { uid, now: T1 });
  assert.ok(ch.id);
  assert.equal(ch.template, DEFAULT_TEMPLATE);
  assert.ok(ch.steps.every((s) => s.id && s.updatedAt === T1));
});
test("a regenerated condition keeps its ids; unchanged steps keep their timestamps", () => {
  const [first] = mergeChains([], [asthma], { uid, now: T1 });
  const [again] = mergeChains([first], [asthma], { uid, now: T2 });
  assert.equal(again.id, first.id);
  assert.deepEqual(again.steps.map((s) => s.id), first.steps.map((s) => s.id));
  assert.ok(again.steps.every((s) => s.updatedAt === T1), "nothing changed, nothing to sync");
});
test("the learner's edits survive regeneration", () => {
  const [first] = mergeChains([], [asthma], { uid, now: T1 });
  const edited = editStep(first, "mechanism", { statement: "Eosinophilic airway inflammation", why: "My words" }, { uid, now: T1 });
  const [again] = mergeChains([edited], [{ ...asthma, steps: asthma.steps.map((s) => (s.key === "mechanism" ? { ...s, statement: "Model rewrite" } : s)) }], { uid, now: T2 });
  const mech = again.steps.find((s) => s.key === "mechanism" && !s.deleted);
  assert.equal(mech.statement, "Eosinophilic airway inflammation");
  assert.equal(mech.edited, true);
});
test("an edited step survives even when the new output drops it", () => {
  const [first] = mergeChains([], [asthma], { uid, now: T1 });
  const filled = editStep(first, "tests", { statement: "Spirometry: reversible obstruction", why: "" }, { uid, now: T1 });
  const [again] = mergeChains([filled], [asthma], { uid, now: T2 });
  assert.ok(again.steps.some((s) => s.key === "tests" && !s.deleted && s.statement.startsWith("Spirometry")));
});
test("unedited steps the new output dropped are tombstoned so the delete syncs", () => {
  const [first] = mergeChains([], [asthma], { uid, now: T1 });
  const [again] = mergeChains([first], [{ title: "Asthma", steps: asthma.steps.slice(0, 2) }], { uid, now: T2 });
  const t = again.steps.find((s) => s.key === "treatment");
  assert.equal(t.deleted, true);
  assert.equal(t.updatedAt, T2);
});
test("conditions no longer generated are tombstoned, unless they hold edits", () => {
  const [a] = mergeChains([], [asthma], { uid, now: T1 });
  const copd = editStep(mergeChains([], [{ ...asthma, title: "COPD" }], { uid, now: T1 })[0], "cause", { statement: "Smoking" }, { uid, now: T1 });
  const out = mergeChains([a, copd], [], { uid, now: T2 });
  assert.equal(out.find((c) => c.id === a.id).deleted, true);
  assert.ok(!out.find((c) => c.id === copd.id).deleted);
  assert.deepEqual(liveChains(out).map((c) => c.title), ["COPD"]);
});

console.log("editing");
test("filling a gap adds an edited step; clearing a step tombstones it", () => {
  const [ch] = mergeChains([], [asthma], { uid, now: T1 });
  const filled = editStep(ch, "signs", { statement: "Expiratory wheeze", why: "" }, { uid, now: T2 });
  assert.equal(chainCoverage(filled).filled, 4);
  const cleared = editStep(filled, "signs", { statement: "  " }, { uid, now: T2 });
  assert.equal(chainCoverage(cleared).filled, 3);
  assert.ok(cleared.steps.some((s) => s.key === "signs" && s.deleted));
  assert.equal(cleared.updatedAt, T2);
});

console.log("sync");
test("chains and steps (with the edited flag) round-trip through the sync mapping", () => {
  const [ch] = mergeChains([], [asthma], { uid, now: T1 });
  const edited = editStep(ch, "cause", { statement: "House dust mite" }, { uid, now: T2 });
  const local = {
    sessions: [{ id: "sess1", title: "Resp", capturedAt: 1 }],
    studySets: [{ id: "st1", sessionId: "sess1", title: "Resp", updatedAt: T1, flashcards: [], quiz: [], chains: [edited] }],
    activity: {}, reviewLog: [],
  };
  const pushed = toServer(local, "");
  assert.equal(pushed.chains.length, 1);
  assert.equal(pushed.chains[0].setId, "sess1");
  const cause = pushed.chainSteps.find((s) => s.key === "cause");
  assert.equal(cause.edited, true);

  const fresh = { sessions: [], studySets: [], activity: {}, reviewLog: [] };
  const pulled = applyServer({ sets: [], cards: [], quiz: [], activity: [], reviews: [], chains: pushed.chains, chainSteps: pushed.chainSteps }, fresh);
  const got = pulled.studySets[0].chains[0];
  assert.equal(got.title, "Asthma");
  assert.equal(got.steps.find((s) => s.key === "cause").statement, "House dust mite");
  assert.equal(got.steps.find((s) => s.key === "cause").edited, true);
});
test("a server response without chains (old server) changes nothing", () => {
  const local = { sessions: [], studySets: [], activity: {}, reviewLog: [] };
  assert.doesNotThrow(() => applyServer({ sets: [], cards: [], quiz: [], activity: [], reviews: [] }, local));
});

console.log(`\n${passed} passed`);
