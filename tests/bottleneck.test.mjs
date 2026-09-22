// Find the bottleneck: architecture rendering. Run: node tests/bottleneck.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderArchitecture } from "../src/storage/bottleneck.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

test("renders components as an indented request flow", () => {
  assert.equal(
    renderArchitecture(["Client", "CDN", "API (3x)", "Postgres primary"]),
    "Client\n  ↳ CDN\n    ↳ API (3x)\n      ↳ Postgres primary"
  );
});

test("handles empty and junk input", () => {
  assert.equal(renderArchitecture([]), "");
  assert.equal(renderArchitecture(null), "");
  assert.equal(renderArchitecture(["Only"]), "Only");
});

test("the flow is readable by screen readers, not just drawn", () => {
  const flow = readFileSync(new URL("../src/ui/flows/bottleneck.js", import.meta.url), "utf8");
  assert.ok(flow.includes('role="img" aria-label="Request flow:'), "the drawing needs a spoken description");
  assert.ok(!flow.includes("�") && !/"\? "/.test(readFileSync(new URL("../src/storage/bottleneck.js", import.meta.url), "utf8")), "no mangled arrow characters");
});

test("the typed answer survives a hint, and the hint is sent to grading", () => {
  const flow = readFileSync(new URL("../src/ui/flows/bottleneck.js", import.meta.url), "utf8");
  assert.ok(flow.includes("s.draft = "), "keep the draft before repainting");
  assert.ok(flow.includes("usedHint: s.usedHint"), "grading must know a hint was used");
});

console.log(`\n${passed} passed`);
