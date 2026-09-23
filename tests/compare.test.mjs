// Comparing two mechanism chains. Run: node tests/compare.test.mjs
import assert from "node:assert/strict";
import { buildForkCards, forkId, isSame, overrideKey, similarity, suggestPairs } from "../src/storage/compare.js";
import { templateSteps } from "../src/storage/chains.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const NOW = Date.parse("2026-09-23T09:00:00.000Z");
const KEYS = templateSteps("medicine-condition");
const chain = (id, title, steps) => ({ id, title, template: "medicine-condition", steps });

const asthma = chain("asthma", "Asthma", [
  { key: "cause", statement: "Allergen or cold air triggers the airway" },
  { key: "tests", statement: "Spirometry shows obstruction that reverses with salbutamol" },
  { key: "treatment", statement: "Inhaled salbutamol as needed" },
  { key: "diagnosis", statement: "gone", deleted: true },
]);
const copd = chain("copd", "COPD", [
  { key: "cause", statement: "Allergen or cold air triggers the airway" },
  { key: "tests", statement: "Spirometry shows fixed obstruction, no reversibility" },
  { key: "treatment", statement: "Inhaled salbutamol as needed" },
]);

console.log("alignment");

test("identical wording is the same step, a different mechanism is a fork", () => {
  assert.equal(isSame(asthma, copd, "cause", {}), true);
  assert.equal(isSame(asthma, copd, "treatment", {}), true);
  assert.equal(isSame(asthma, copd, "tests", {}), false);
});

test("a step only one chain fills is never 'the same'", () => {
  assert.equal(isSame(asthma, copd, "symptoms", {}), false); // neither has it
  assert.equal(isSame(asthma, copd, "diagnosis", {}), false); // tombstoned on one side
  assert.equal(similarity("", ""), 1);
  assert.equal(similarity("a b", ""), 0);
});

console.log("overrides");

test("the learner's call beats the guess, whichever way round the pair is", () => {
  const set = { chainOverrides: { [overrideKey("asthma", "copd", "tests")]: "same", [overrideKey("copd", "asthma", "treatment")]: "diff" } };
  assert.equal(isSame(asthma, copd, "tests", set), true);
  assert.equal(isSame(copd, asthma, "tests", set), true);
  assert.equal(isSame(asthma, copd, "treatment", set), false);
  assert.equal(isSame(copd, asthma, "treatment", set), false);
});

test("an override survives a reworded step", () => {
  const set = { chainOverrides: { [overrideKey("asthma", "copd", "tests")]: "same" } };
  const reworded = chain("copd", "COPD", [{ key: "tests", statement: "Post-bronchodilator FEV1/FVC stays below 0.7" }]);
  assert.equal(isSame(asthma, reworded, "tests", set), true);
});

console.log("fork cards");

test("one card per fork, with a real schedule so it reviews and syncs", () => {
  const set = { flashcards: [] };
  const added = buildForkCards(asthma, copd, set, KEYS, { now: NOW });
  assert.equal(added, 1); // only Tests differs; cause and treatment match
  const card = set.flashcards[0];
  assert.equal(card.id, forkId("asthma", "copd", "tests"));
  assert.equal(card.front, "What separates Asthma from COPD on Tests?");
  assert.equal(card.back, "Asthma: Spirometry shows obstruction that reverses with salbutamol\nCOPD: Spirometry shows fixed obstruction, no reversibility");
  assert.equal(card.dueDate, NOW);
  assert.equal(card.repetitions, 0);
  assert.equal(card.easiness, 2.5);
  assert.ok(card.updatedAt, "an unstamped card never syncs");
});

test("gaps make no cards: a step missing on one side isn't a difference", () => {
  const thin = chain("thin", "Thin", [{ key: "tests", statement: "Spirometry shows fixed obstruction, no reversibility" }]);
  const set = { flashcards: [] };
  buildForkCards(asthma, thin, set, KEYS, { now: NOW });
  assert.deepEqual(set.flashcards.map((c) => c.id), [forkId("asthma", "thin", "tests")]);
});

test("making cards twice adds nothing and keeps the schedule", () => {
  const set = { flashcards: [] };
  buildForkCards(asthma, copd, set, KEYS, { now: NOW });
  set.flashcards[0].repetitions = 4;
  set.flashcards[0].dueDate = NOW + 86_400_000;
  assert.equal(buildForkCards(asthma, copd, set, KEYS, { now: NOW }), 0);
  assert.equal(set.flashcards.length, 1);
  assert.equal(set.flashcards[0].repetitions, 4);
});

test("an override turns a fork into a card, or takes one away", () => {
  const set = { flashcards: [], chainOverrides: { [overrideKey("asthma", "copd", "treatment")]: "diff" } };
  assert.equal(buildForkCards(asthma, copd, set, KEYS, { now: NOW }), 2);
  assert.ok(set.flashcards.some((c) => c.id === forkId("asthma", "copd", "treatment")));
});

test("a deleted fork card comes back as new, not as a duplicate", () => {
  const set = { flashcards: [] };
  buildForkCards(asthma, copd, set, KEYS, { now: NOW });
  Object.assign(set.flashcards[0], { deleted: true, repetitions: 3 });
  assert.equal(buildForkCards(asthma, copd, set, KEYS, { now: NOW }), 1);
  assert.equal(set.flashcards.length, 1);
  assert.equal(set.flashcards[0].deleted, false);
  assert.equal(set.flashcards[0].repetitions, 0);
});

console.log("pairs");

test("the closest pair is offered first", () => {
  const twin = chain("twin", "Asthma variant", asthma.steps);
  const pairs = suggestPairs([asthma, copd, twin], {});
  assert.equal(pairs.length, 3);
  assert.equal(pairs[0].c1.id, "asthma");
  assert.equal(pairs[0].c2.id, "twin");
  assert.ok(pairs[0].shared > pairs[2].shared);
});

test("pair counts follow the learner's overrides", () => {
  const plain = suggestPairs([asthma, copd], {})[0].shared;
  const set = { chainOverrides: { [overrideKey("asthma", "copd", "tests")]: "same" } };
  assert.equal(suggestPairs([asthma, copd], set)[0].shared, plain + 1);
});

console.log(`\n${passed} passed`);
