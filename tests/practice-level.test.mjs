// Practice levels and the chain drill's multiple-choice options (docs/prompts/39).
// Run: node tests/practice-level.test.mjs
import assert from "node:assert/strict";
import { LEVEL_IDS, LEVELS, isLevel, levelFlags, levelLabel, nextLevel, resolveLevel, suggestStepUp } from "../src/storage/practice-level.js";
import { chainHints, pickChainOptions, seededShuffle, trimChain } from "../src/storage/chain-options.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("levels");
test("three levels, with plain names", () => {
  assert.deepEqual(LEVEL_IDS, ["beginner", "intermediate", "advanced"]);
  assert.equal(levelLabel("beginner"), "Beginner");
  assert.equal(levelLabel("nonsense"), "Beginner");
  assert.ok(LEVEL_IDS.every((id) => LEVELS[id].description.length > 10));
  assert.ok(isLevel("advanced") && !isLevel("expert"));
});

test("Beginner taps, Intermediate adds a why, Advanced types; chains grow with the level", () => {
  assert.equal(levelFlags("beginner").clinicalAnswers, "choice");
  assert.equal(levelFlags("intermediate").clinicalAnswers, "choice+why");
  assert.equal(levelFlags("advanced").clinicalAnswers, "typed");
  assert.equal(levelFlags("beginner").chainAnswers, "choice");
  assert.equal(levelFlags("intermediate").chainAnswers, "typed");
  assert.deepEqual(LEVEL_IDS.map((l) => levelFlags(l).chainLength), [4, 6, Infinity]);
  assert.deepEqual(levelFlags("nonsense"), levelFlags("beginner"));
});

test("the level is per set and defaults to Beginner", () => {
  assert.equal(resolveLevel({}, "s1"), "beginner");
  assert.equal(resolveLevel({ practiceLevels: { s1: "advanced" } }, "s1"), "advanced");
  assert.equal(resolveLevel({ practiceLevels: { s1: "advanced" } }, "s2"), "beginner");
  assert.equal(resolveLevel({ practiceLevels: { s1: "expert" } }, "s1"), "beginner");
});

test("a step up is suggested after two strong cases in a row, never automatically, never past Advanced", () => {
  assert.equal(nextLevel("beginner"), "intermediate");
  assert.equal(nextLevel("advanced"), "advanced");
  assert.equal(suggestStepUp([0.9, 0.85], "beginner"), "intermediate");
  assert.equal(suggestStepUp([0.5, 0.9, 0.8], "intermediate"), "advanced");
  assert.equal(suggestStepUp([0.9, 0.79], "beginner"), null, "the last two both count");
  assert.equal(suggestStepUp([0.95], "beginner"), null, "one strong case isn't enough");
  assert.equal(suggestStepUp([1, 1, 1], "advanced"), null);
  assert.equal(suggestStepUp([], "beginner"), null);
});

console.log("chain drill options");
const step = (key, statement, why = "") => ({ key, label: key, step: { statement, why } });
const chain = (id, ...steps) => ({ id, title: id, steps });

test("four options, the right one among them, deterministic for a seed", () => {
  const asthma = chain("asthma", step("cause", "An allergen triggers the airway"), step("mechanism", "Mast cells degranulate"), step("symptoms", "Episodic wheeze"));
  const copd = chain("copd", step("cause", "Years of smoke damage the airway"), step("mechanism", "Neutrophilic inflammation"));
  const a = pickChainOptions({ target: asthma.steps[1], chain: asthma, otherChains: [copd], seed: 7 });
  const b = pickChainOptions({ target: asthma.steps[1], chain: asthma, otherChains: [copd], seed: 7 });
  assert.deepEqual(a, b);
  assert.equal(a.options.length, 4);
  assert.equal(a.options.find((o) => o.id === a.correctId).text, "Mast cells degranulate");
  assert.equal(new Set(a.options.map((o) => o.text.toLowerCase())).size, 4, "no duplicates");
});

test("prefers the same kind of step from other chains, then this chain's other steps", () => {
  const mine = chain("mine", step("cause", "A"), step("mechanism", "Right answer"), step("symptoms", "Own symptom"));
  const other = chain("other", step("mechanism", "Other mechanism one"), step("mechanism", "Other mechanism two"), step("mechanism", "Other mechanism three"), step("cause", "Other cause"));
  const r = pickChainOptions({ target: mine.steps[1], chain: mine, otherChains: [other], seed: 1 });
  const wrong = r.options.filter((o) => o.id !== r.correctId).map((o) => o.text).sort();
  assert.deepEqual(wrong, ["Other mechanism one", "Other mechanism three", "Other mechanism two"]);
});

test("never offers the right answer twice, even if another chain repeats it", () => {
  const mine = chain("mine", step("cause", "Same text"), step("mechanism", "X"), step("symptoms", "Y"));
  const other = chain("other", step("cause", "same text"), step("cause", "Different cause"));
  const r = pickChainOptions({ target: mine.steps[0], chain: mine, otherChains: [other], seed: 3 });
  assert.equal(r.options.filter((o) => o.text.toLowerCase() === "same text").length, 1);
});

test("returns null when there aren't enough different wrong answers, so the drill asks for typing instead", () => {
  const lone = chain("lone", step("cause", "Only step"), step("mechanism", "One other"));
  assert.equal(pickChainOptions({ target: lone.steps[0], chain: lone, otherChains: [], seed: 1 }), null);
});

test("seededShuffle is a permutation and repeatable", () => {
  const list = [1, 2, 3, 4, 5, 6];
  const s = seededShuffle(list, 42);
  assert.deepEqual([...s].sort(), list);
  assert.deepEqual(s, seededShuffle(list, 42));
  assert.deepEqual(list, [1, 2, 3, 4, 5, 6], "the input isn't changed");
});

test("hints go from where to look to the key idea, and never hand over the statement", () => {
  const c = chain("c", step("cause", "An allergen triggers a primed airway"), step("mechanism", "Mast cells degranulate and muscle constricts", "Histamine acts in minutes."), step("symptoms", "Episodic wheeze"));
  const h = chainHints(c.steps, 1);
  assert.equal(h.length, 3);
  assert.match(h[0], /mechanism/i);
  assert.match(h[1], /Histamine acts in minutes/);
  assert.match(h[2], /^It starts: “Mast cells…/);
  assert.ok(!h.some((x) => x.includes("Mast cells degranulate and muscle constricts")));
  const noWhy = chainHints(c.steps, 0);
  assert.match(noWhy[1], /Mast cells|Episodic/, "without a why it names the neighbours instead");
  const dotted = chainHints([step("a", "First step."), step("b", "Middle step."), step("c", "Last step.")], 1);
  assert.equal(dotted[1], "It sits between: “First step” and “Last step”.");
  assert.equal(dotted[2], "It starts: “Middle step…”");
});

test("trimChain keeps the steps nearest the given end, in order, up to the level's length", () => {
  const steps = ["a", "b", "c", "d", "e", "f", "g"].map((k) => step(k, k.toUpperCase()));
  assert.deepEqual(trimChain(steps, 4).map((s) => s.key), ["d", "e", "f", "g"]);
  assert.equal(trimChain(steps, Infinity).length, 7);
  assert.equal(trimChain(steps.slice(0, 2), 4).length, 2);
});

console.log(`\n${passed} passed`);
