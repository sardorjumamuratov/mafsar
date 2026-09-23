// Chain drill rules. Run: node tests/chain-drills.test.mjs
import assert from "node:assert/strict";
import { EXERCISES, drillableChains, drillCounts, failedLinkIds, pickDrillChain, roundScore, shuffledOrder } from "../src/storage/chain-drill.js";
import { linkId } from "../src/storage/chain-links.js";
import { drillLogEntry } from "../src/storage/drill-log.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const chain = (id, title, keys) => ({
  id,
  title,
  template: "medicine-condition",
  steps: keys.map((k) => ({ id: `${id}-${k}`, key: k, statement: `${k} text` })),
});
const asthma = chain("c1", "Asthma", ["cause", "mechanism", "tests"]);
const copd = chain("c2", "COPD", ["cause", "mechanism"]);
const thin = chain("c3", "Thin", ["cause"]);

console.log("choosing what to drill");
test("a chain needs at least two filled steps", () => {
  assert.deepEqual(drillableChains([asthma, copd, thin]).map((c) => c.id), ["c1", "c2"]);
  assert.equal(pickDrillChain([thin], [], "sess1"), null);
});

test("the least-drilled chain comes up next", () => {
  const log = [
    { kind: "chain-drill", sessionId: "sess1", chainId: "c1" },
    { kind: "chain-drill", sessionId: "sess1", chainId: "c1" },
    { kind: "chain-drill", sessionId: "other", chainId: "c2" },
    { kind: "teach", sessionId: "sess1", chainId: "c2" },
  ];
  assert.equal(drillCounts(log, "sess1").get("c1"), 2);
  assert.equal(drillCounts(log, "sess1").get("c2"), undefined, "other sets and other kinds don't count");
  assert.equal(pickDrillChain([asthma, copd], log, "sess1").id, "c2");
});

test("ties are broken by title, so the pick isn't random", () => {
  assert.equal(pickDrillChain([copd, asthma], [], "sess1").id, "c1");
});

console.log("exercises");
test("three exercises", () => {
  assert.deepEqual(EXERCISES, ["rebuild", "gap", "backwards"]);
});

test("the shuffle never hands back the finished chain", () => {
  for (let i = 0; i < 50; i++) {
    const order = shuffledOrder(4);
    assert.deepEqual([...order].sort((a, b) => a - b), [0, 1, 2, 3], "every step exactly once");
    assert.ok(!order.every((v, idx) => v === idx), "not already in order");
  }
  assert.deepEqual(shuffledOrder(1), [0]);
});

console.log("scoring and logging");
test("the score is the share of links the learner got right", () => {
  const steps = [{ key: "cause" }, { key: "mechanism", failed: true }, { key: "tests" }];
  assert.equal(roundScore(steps), 0.5);
  assert.equal(roundScore([{ key: "cause" }, { key: "mechanism" }]), 1);
  assert.equal(roundScore([{ key: "cause" }]), 1);
});

test("failed steps map to their link cards, so those links come back sooner", () => {
  const steps = [{ key: "cause" }, { key: "mechanism", failed: true }, { key: "tests" }];
  assert.deepEqual(failedLinkIds(asthma, steps), [linkId("c1", "cause", "mechanism")]);
});

test("the log row is valid for sync: a grade, a card id, and the chain", () => {
  const row = drillLogEntry({ kind: "chain-drill", sessionId: "sess1", chainId: "c1", fraction: 0.5, id: "r1" });
  assert.equal(row.kind, "chain-drill");
  assert.equal(row.chainId, "c1");
  assert.ok(row.cardId.length > 0, "an empty cardId fails the whole sync batch");
  assert.equal(typeof row.grade, "number");
  assert.ok(row.grade >= 0 && row.grade <= 5);
});

console.log(`\n${passed} passed`);
