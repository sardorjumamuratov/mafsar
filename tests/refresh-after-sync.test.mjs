// A sync that pulls rows has to reach the screen, or a fresh sign-in shows an
// empty Home until the learner switches tabs and back.
// The guard that keeps it from repainting over a focus view lives in
// tests/focus-view.test.mjs.
// Run: node tests/refresh-after-sync.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import { join } from "node:path";

const read = (p) => fs.readFileSync(join(import.meta.dirname, p), "utf8").replace(/\r\n/g, "\n");

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

test("the event is announced once, as a shared constant", () => {
  const sync = read("../src/sync/sync.js");
  assert.ok(/export const SYNC_PULLED_EVENT\s*=/.test(sync), "the name belongs in one place, not two string literals");
  const panel = read("../src/ui/panel.js");
  assert.ok(panel.includes("SYNC_PULLED_EVENT"), "the panel listens using the same constant");
  assert.ok(!/addEventListener\(['"]mafsar:sync-pulled/.test(panel), "a literal here drifts from the emitter");
});

test("only a sync that actually pulled something announces itself", () => {
  const sync = read("../src/sync/sync.js");
  const tail = sync.slice(sync.indexOf("await setLastSync"));
  assert.ok(tail.includes("totalPulled > 0"), "an empty sync must not repaint the panel");
});

test("the emitter survives a context with no window", () => {
  // sync.js is a plain module; nothing stops the service worker importing it,
  // and a bare window reference there throws in the middle of a sync.
  const sync = read("../src/sync/sync.js");
  const line = sync.split("\n").find((l) => l.includes("dispatchEvent"));
  assert.ok(line, "no dispatch found");
  const context = sync.slice(sync.indexOf("totalPulled > 0"), sync.indexOf("dispatchEvent"));
  assert.ok(/typeof window/.test(context), "guard the dispatch, or a worker-side sync throws");
});

test("one mechanism, not a patch at every call site", () => {
  for (const f of ["../src/ui/views/sets.js", "../src/ui/flows/review.js", "../src/ui/views/set-detail.js"]) {
    const src = read(f);
    const calls = [...src.matchAll(/syncNow\(\)[^;]*/g)].map((m) => m[0]);
    for (const call of calls) {
      assert.ok(
        !call.includes("goToActiveTab") && !call.includes("renderHome"),
        f + " repaints at the call site instead of leaving it to the event"
      );
    }
  }
});

console.log(`\n${passed} passed`);
