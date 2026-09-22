
import assert from "node:assert/strict";
import { assembleAnswer, reviewGradeForDesign } from "../src/storage/design.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  - ${name}`);
}

test("assembles answer skipping empty sections", () => {
  const sections = {
    requirements: "Fast",
    estimates: "",
    api: "REST",
    dataModel: "  ",
    components: "LB",
    bottlenecks: "DB"
  };
  const ans = assembleAnswer(sections);
  assert.equal(ans, "Requirements:\nFast\n\nAPI:\nREST\n\nComponents & flow:\nLB\n\nBottlenecks & trade-offs:\nDB");
});

test("clamps long answers", () => {
  const sections = {
    requirements: "A".repeat(5000)
  };
  const ans = assembleAnswer(sections);
  assert.equal(ans.length <= 4000, true);
});

test("review grades map correctly", () => {
  // We mirror teach/coding log grades. 4 = covered well, 2 = partial/needs work, 1 = missed completely.
  assert.equal(reviewGradeForDesign("strong"), 4);
  assert.equal(reviewGradeForDesign("partial"), 2);
  assert.equal(reviewGradeForDesign("weak"), 1);
});

console.log(`\n${passed} passed`);

