// Design drill rules. Run: node tests/design.test.mjs
import assert from "node:assert/strict";
import {
  MAX_CURVEBALLS, MAX_DESIGN_CHARS, SECTIONS, answerTooLong, assembleAnswer, drillScore, emptySections, rubricScore,
} from "../src/storage/design.js";
import { drillCardId, drillGrade, drillLogEntry } from "../src/storage/drill-log.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("answer template");
test("six sections, all empty to start", () => {
  assert.equal(SECTIONS.length, 6);
  assert.deepEqual(Object.values(emptySections()), ["", "", "", "", "", ""]);
});
test("only filled sections are sent, under their titles, in template order", () => {
  const ans = assembleAnswer({ bottlenecks: "DB", requirements: " Fast ", api: "REST", dataModel: "  " });
  assert.equal(ans, "Requirements:\nFast\n\nAPI:\nREST\n\nBottlenecks & trade-offs:\nDB");
});
test("long answers are not silently cut: the length check sees them", () => {
  const ans = assembleAnswer({ requirements: "A".repeat(MAX_DESIGN_CHARS + 50) });
  assert.ok(ans.length > MAX_DESIGN_CHARS);
  assert.equal(answerTooLong(ans), true);
  assert.equal(answerTooLong("short"), false);
});

console.log("scoring");
test("rubric score counts partial as half", () => {
  assert.equal(rubricScore([{ status: "covered" }, { status: "partial" }, { status: "missed" }, { status: "covered" }]), 0.625);
  assert.equal(rubricScore([]), 0);
});
test("drill score weighs the first design double", () => {
  const first = { rubric_evaluation: [{ status: "covered" }] };
  const weakCurve = { rubric_evaluation: [{ status: "missed" }] };
  assert.equal(drillScore(first, []), 1);
  assert.ok(Math.abs(drillScore(first, [weakCurve]) - 2 / 3) < 1e-9);
  assert.equal(MAX_CURVEBALLS, 2);
});

console.log("drill log rows");
test("rows carry a non-empty card id, or every future sync fails server validation", () => {
  const row = drillLogEntry({ kind: "design", sessionId: "s1", fraction: 0.9, id: "r1" });
  assert.equal(row.cardId, drillCardId("s1"));
  assert.ok(row.cardId.length > 0);
  assert.equal(row.kind, "design");
  assert.equal(row.prevInterval, 0);
});
test("results map onto the review grade scale", () => {
  assert.equal(drillGrade(1), 5);
  assert.equal(drillGrade(0.7), 4);
  assert.equal(drillGrade(0.4), 3);
  assert.equal(drillGrade(0), 1);
});
test("unknown kinds and missing sets are rejected", () => {
  assert.throws(() => drillLogEntry({ kind: "teach", sessionId: "s1", fraction: 1, id: "x" }));
  assert.throws(() => drillLogEntry({ kind: "design", sessionId: "", fraction: 1, id: "x" }));
});

console.log(`\n${passed} passed`);
