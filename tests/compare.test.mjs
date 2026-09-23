
import assert from "node:assert";
import { isSame, suggestPairs, buildForkCards } from "../src/storage/compare.js";
import { TEMPLATES } from "../src/storage/chains.js";

let passed = 0;
function test(name, fn) {
  try {
    fn();
    console.log("  ? " + name);
    passed++;
  } catch (e) {
    console.error("  ? " + name);
    console.error(e);
    process.exit(1);
  }
}

console.log("compare.js");

const asthma = {
  id: "asthma", title: "Asthma",
  steps: [
    { key: "tests", statement: "Spirometry with reversibility" },
    { key: "treatment", statement: "SABA inhaler" },
    { key: "missing", deleted: true, statement: "old" }
  ]
};

const copd = {
  id: "copd", title: "COPD",
  steps: [
    { key: "tests", statement: "Completely different test" },
    { key: "treatment", statement: "SABA inhaler or LAMA" }
  ]
};

test("alignment and divergence detection", () => {
  const set = {};
  assert.equal(isSame(asthma, copd, "tests", set), false);
  assert.equal(isSame(asthma, copd, "treatment", set), true);
});

test("overrides persisting", () => {
  const set = { chainOverrides: { "asthma_copd_tests": "same", "asthma_copd_treatment": "diff" } };
  assert.equal(isSame(asthma, copd, "tests", set), true);
  assert.equal(isSame(asthma, copd, "treatment", set), false);
});

test("fork-card creation (including skipping gaps)", () => {
  const set = { flashcards: [] };
  const keys = TEMPLATES["medicine-condition"].steps;
  const count = buildForkCards(asthma, copd, set, keys);
  assert.equal(count, 1);
  assert.equal(set.flashcards.length, 1);
  assert.ok(set.flashcards[0].front.includes("Asthma"));
  assert.ok(set.flashcards[0].front.includes("COPD"));
  assert.ok(set.flashcards[0].front.includes("Tests"));
  assert.equal(set.flashcards[0].back, "Asthma: Spirometry with reversibility\nCOPD: Completely different test");
  
  // Gaps (like missing key in asthma) are skipped
  const c = buildForkCards(asthma, copd, set, keys);
  assert.equal(c, 0); // No new cards
});

test("suggest pairs sorts by shared steps", () => {
  const c3 = {
    id: "c3", title: "c3",
    steps: [
      { key: "tests", statement: "Spirometry with reversibility" },
      { key: "treatment", statement: "SABA inhaler" }
    ]
  };
  const pairs = suggestPairs([asthma, copd, c3]);
  assert.equal(pairs.length, 3);
  assert.equal(pairs[0].c1.id, "asthma");
  assert.equal(pairs[0].c2.id, "c3");
  assert.equal(pairs[0].shared, 2);
});

console.log("\\n" + passed + " passed");

