// Clinical cases reuse the Design drill shell with clinical sections and copy.
// Run: node tests/clinical-cases.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CLINICAL_FINAL_SECTIONS, CLINICAL_SECTIONS, SECTIONS, assembleAnswer, emptySections } from "../src/storage/design.js";
import { drillLogEntry } from "../src/storage/drill-log.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

console.log("case template");
test("the first stage asks for a diagnosis and the tests to request", () => {
  assert.deepEqual(CLINICAL_SECTIONS.map((s) => s.key), ["leading", "tests"]);
  assert.deepEqual(Object.keys(emptySections("clinical")), ["leading", "tests"]);
  assert.deepEqual(CLINICAL_FINAL_SECTIONS.map((s) => s.key), ["final"]);
});

test("design sets keep their own six sections", () => {
  assert.equal(Object.keys(emptySections()).length, SECTIONS.length);
  assert.equal(SECTIONS.length, 6);
});

test("the answer is assembled under the clinical titles, in order", () => {
  const ans = assembleAnswer({ leading: "Asthma", tests: "Spirometry", final: "Asthma; inhaled steroid" }, "clinical");
  assert.equal(ans, "Leading diagnosis & why:\nAsthma\n\nTests you would request:\nSpirometry\n\nFinal diagnosis & management:\nAsthma; inhaled steroid");
});

console.log("wiring");
test("clinical mode and the case state reach the server", () => {
  const flow = read("../src/ui/flows/design.js");
  assert.ok(flow.includes("mode: s.mode"), "the flow sends its mode");
  assert.ok(flow.includes("state: s.encryptedState"), "and the encrypted case");
  const sw = read("../src/background/service-worker.js");
  for (const msg of ["DESIGN_TASK", "DESIGN_GRADE", "DESIGN_CURVEBALL"]) {
    const block = sw.slice(sw.indexOf(`case "${msg}"`), sw.indexOf(`case "${msg}"`) + 500);
    assert.ok(block.includes("clinical"), `${msg} must forward the mode`);
  }
});

test("a clinical case is logged as its own kind, not as a design drill", () => {
  assert.ok(read("../src/ui/flows/design.js").includes(`s.mode === "clinical" ? "clinical" : "design"`));
  const row = drillLogEntry({ kind: "clinical", sessionId: "sess1", fraction: 0.8, id: "r1" });
  assert.equal(row.kind, "clinical");
  assert.ok(row.cardId.length > 0);
});

test("Medicine sets offer both practice modes", () => {
  const detail = read("../src/ui/views/set-detail.js");
  assert.ok(detail.includes('data-action="start-chain-drill"'));
  assert.ok(detail.includes('data-action="start-clinical-case"'));
});

console.log(`\n${passed} passed`);
