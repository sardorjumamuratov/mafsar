// Duplicate checks for review-card suggestions. Run: node tests/card-dedupe.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeFront, jaccard, isDuplicate, selectSuggestions } from "../src/storage/card-dedupe.js";

test("card-dedupe", async (t) => {
  await t.test("normalizeFront", () => {
    assert.equal(normalizeFront("What is the CAP theorem?"), "what is cap theorem");
    assert.equal(normalizeFront("  A   quick, brown fox! "), "quick brown fox");
  });

  await t.test("keeps letters in every script", () => {
    assert.equal(normalizeFront("Что такое кэш?"), "что такое кэш");
    assert.equal(normalizeFront("Keshlash nima?"), "keshlash nima");
  });

  await t.test("jaccard", () => {
    assert.equal(jaccard("What is CAP theorem?", "What is the CAP theorem?"), 1);
    assert.ok(jaccard("What is consistency?", "What is the consistency model?") > 0.6);
    assert.equal(jaccard("?!", "..."), 0, "two empty texts are no evidence of a match");
  });

  await t.test("isDuplicate", () => {
    const existing = ["What is the CAP theorem?", "Define eventual consistency"];
    assert.ok(isDuplicate("What is CAP theorem?", existing));
    assert.ok(!isDuplicate("What is a hot partition?", existing));
  });

  await t.test("Cyrillic cards are compared, not all treated as duplicates", () => {
    const existing = ["Что такое кэш?"];
    assert.ok(isDuplicate("Что такое кэш", existing));
    assert.ok(!isDuplicate("Почему одна основная база становится узким местом?", existing));
  });

  await t.test("selectSuggestions drops near-copies of the set and of each other, and keeps at most three", () => {
    const card = (front) => ({ front, back: "b" });
    const { kept, skipped } = selectSuggestions(
      [card("What is the CAP theorem?"), card("Why shard writes?"), card("Why shard the writes?"), card("What is a hot key?"), card("What is replication lag?"), card("What is a write-ahead log?")],
      ["What is CAP theorem?"],
    );
    assert.deepEqual(kept.map((k) => k.front), ["Why shard writes?", "What is a hot key?", "What is replication lag?"]);
    assert.equal(skipped, 2);
  });
});
