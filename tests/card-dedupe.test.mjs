import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeFront, jaccard, isDuplicate } from "../src/storage/card-dedupe.js";

test("card-dedupe", async (t) => {
  await t.test("normalizeFront", () => {
    assert.equal(normalizeFront("What is the CAP theorem?"), "what is cap theorem");
    assert.equal(normalizeFront("  A   quick, brown fox! "), "quick brown fox");
  });

  await t.test("jaccard", () => {
    assert.equal(jaccard("What is CAP theorem?", "What is the CAP theorem?"), 1);
    assert.ok(jaccard("What is consistency?", "What is the consistency model?") > 0.6);
  });

  await t.test("isDuplicate", () => {
    const existing = ["What is the CAP theorem?", "Define eventual consistency"];
    assert.ok(isDuplicate("What is CAP theorem?", existing));
    assert.ok(!isDuplicate("What is a hot partition?", existing));
  });
});
