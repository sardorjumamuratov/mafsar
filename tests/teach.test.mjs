// Teach-it-back client rules. Run: node tests/teach.test.mjs
import assert from "node:assert/strict";
import {
  MAX_TEACH_CARDS, STUCK_TEXT, canFinish, coverageCount, mergeCoverage, reviewGradeFor, selectTeachCards,
} from "../src/storage/teach.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const card = (id, extra = {}) => ({ id, front: `front ${id}`, back: `back ${id}`, ...extra });

test("picks due cards first, keeps set order, caps at six", () => {
  const cards = [card("a"), card("b", { due: true }), card("c"), card("d", { due: true }), card("e"), card("f"), card("g"), card("h")];
  const picked = selectTeachCards(cards, (c) => !!c.due);
  assert.equal(picked.length, MAX_TEACH_CARDS);
  assert.deepEqual(picked.map((c) => c.id), ["b", "d", "a", "c", "e", "f"]);
  assert.deepEqual(Object.keys(picked[0]).sort(), ["back", "front", "id"]);
});

test("skips cards without a back, and works with no due-check", () => {
  assert.deepEqual(selectTeachCards([card("a", { back: "" }), card("b")]).map((c) => c.id), ["b"]);
  assert.deepEqual(selectTeachCards(undefined), []);
});

test("coverage only moves forward", () => {
  const merged = mergeCoverage({ a: "covered", b: "partial" }, { a: "partial", b: "covered", c: "not_yet" });
  assert.deepEqual(merged, { a: "covered", b: "covered", c: "not_yet" });
});

test("coverage ignores invalid values, including inherited names", () => {
  assert.deepEqual(mergeCoverage({}, { a: "amazing", b: "toString" }), {});
});

test("counts covered ideas", () => {
  assert.deepEqual(coverageCount({ a: "covered", b: "partial" }, [card("a"), card("b"), card("c")]), { covered: 1, total: 3 });
});

test("finishing needs at least two explanations", () => {
  assert.equal(canFinish([{ role: "learner", text: "a" }]), false);
  assert.equal(canFinish([{ role: "learner", text: "a" }, { role: "student", text: "?" }, { role: "learner", text: "b" }]), true);
});

test("review grades: taught 4, with hints 3, needs fixing 1, not covered skipped", () => {
  assert.equal(reviewGradeFor("taught"), 4);
  assert.equal(reviewGradeFor("taught_with_hints"), 3);
  assert.equal(reviewGradeFor("incorrect"), 1);
  assert.equal(reviewGradeFor("not_covered"), null);
});

test("the stuck message is fixed text", () => {
  assert.ok(STUCK_TEXT.includes("stuck"));
});

console.log(`\n${passed} passed`);
