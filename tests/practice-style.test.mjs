// Practice styles and drill-log metadata (docs/prompts/38). Run: node tests/practice-style.test.mjs
import assert from "node:assert/strict";
import { PRACTICE_STYLES, STYLE_IDS, isStyle, resolveStyle, styleFlags, styleLabel, styleShort } from "../src/storage/practice-style.js";
import { drillLogEntry, drillMeta } from "../src/storage/drill-log.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("practice styles");
test("two styles, with the UI names from the spec", () => {
  assert.deepEqual(STYLE_IDS, ["guided", "simulation"]);
  assert.equal(styleLabel("guided"), "Learn concepts");
  assert.equal(styleLabel("simulation"), "Interview simulation");
  assert.equal(styleLabel(null), "Not set");
  assert.equal(styleShort("guided"), "Guided");
  assert.equal(PRACTICE_STYLES.guided.description, "Get guidance, optional hints, and feedback as you go.");
  assert.equal(PRACTICE_STYLES.simulation.description, "Practice under realistic conditions and review feedback at the end.");
});

test("an override beats the saved default; nothing saved means ask", () => {
  assert.equal(resolveStyle({ systemDesignPracticeStyle: "guided" }, "simulation"), "simulation");
  assert.equal(resolveStyle({ systemDesignPracticeStyle: "guided" }, undefined), "guided");
  assert.equal(resolveStyle({}, undefined), null);
  assert.equal(resolveStyle({ systemDesignPracticeStyle: "adaptive" }, "bogus"), null, "unknown values are ignored");
});

test("behaviour comes from flags, so a new style is one registry entry", () => {
  assert.equal(styleFlags("guided").hintPenalty, 0, "guided hints never cost points");
  assert.equal(styleFlags("simulation").hintPenalty, 0.5);
  assert.equal(styleFlags("guided").progressiveHints, 3);
  assert.equal(styleFlags("simulation").checkpoints, false);
  assert.deepEqual(styleFlags("adaptive"), styleFlags("simulation"), "an unknown style behaves like today's drills");
  for (const id of STYLE_IDS) {
    assert.deepEqual(Object.keys(PRACTICE_STYLES[id].flags).sort(), Object.keys(PRACTICE_STYLES.guided.flags).sort(), `${id} defines every flag`);
  }
  assert.ok(isStyle("guided") && !isStyle("adaptive"));
});

console.log("drill-log metadata");
test("session metadata rides on the row, bounded and typed", () => {
  const row = drillLogEntry({
    kind: "bottleneck", sessionId: "s1", fraction: 2 / 3, id: "r1",
    meta: { practiceStyle: "guided", mode: "what_breaks", durationMs: 61234.4, usedHint: true, hintCount: 2, selectedComponentId: "postgres-primary", savedSuggestedCardIds: ["a", "b", "c", "d"], answer: "never stored" },
  });
  assert.equal(row.practiceStyle, "guided");
  assert.equal(row.durationMs, 61234);
  assert.equal(row.usedHint, true);
  assert.deepEqual(row.savedSuggestedCardIds, ["a", "b", "c"]);
  assert.equal(row.answer, undefined, "no answer text on the review log");
  assert.equal(row.grade, 4, "the score semantics don't move");
});

test("rows without metadata are unchanged, and junk is dropped", () => {
  const plain = drillLogEntry({ kind: "design", sessionId: "s1", fraction: 1, id: "r2", reviewedAt: "2026-10-07T00:00:00.000Z" });
  assert.deepEqual(Object.keys(plain).sort(), ["cardId", "grade", "id", "kind", "newInterval", "prevInterval", "reviewedAt", "sessionId"]);
  assert.deepEqual(drillMeta({ durationMs: -5, usedHint: "yes", mode: 7 }), {});
});

test("a row with metadata still has every field the server's reviewSchema requires", () => {
  const row = drillLogEntry({ kind: "estimation", sessionId: "s1", fraction: 0.5, id: "r3", meta: { practiceStyle: "simulation" } });
  for (const k of ["id", "cardId", "grade", "prevInterval", "newInterval", "reviewedAt", "kind"]) assert.ok(k in row, k);
  assert.ok(row.cardId.length > 0 && Number.isInteger(row.grade) && row.grade >= 0 && row.grade <= 5);
});

console.log(`\n${passed} passed`);
