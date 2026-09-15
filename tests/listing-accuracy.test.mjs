// Store listing and panel copy must match the product. Run: node tests/listing-accuracy.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ? ${name}`);
}

test("the store listing doesn't claim offline use", () => {
  const md = read("docs/store-listing.md");
  assert.ok(!/works offline/i.test(md), "an account is required: see src/ui/panel.js");
  assert.ok(/account required/i.test(md), "say plainly that a free account is required");
});

test("the store listing contains no credentials", () => {
  const md = read("docs/store-listing.md");
  assert.ok(!/^\s*Password:\s*\S/m.test(md), "reviewer passwords go in the store's private reviewer-notes field, never in the repo");
  assert.ok(!/^\s*Email:\s*\S+@/m.test(md), "no reviewer test-account email in the repo either");
});

test("the build note discloses the vendored minified file", () => {
  assert.ok(read("docs/store-listing.md").includes("flatpickr"), "mention src/vendor/flatpickr.js in the build note");
});

test("panel copy doesn't promise account-free use", () => {
  for (const f of ["src/ui/views/you.js", "src/ui/views/teams.js"]) {
    const s = read(f);
    for (const phrase of ["works offline without an account", "keeps working offline", "Everything stays on this device"]) {
      assert.ok(!s.includes(phrase), `${f} still says "${phrase}"`);
    }
  }
});

console.log(`\n${passed} passed`);

