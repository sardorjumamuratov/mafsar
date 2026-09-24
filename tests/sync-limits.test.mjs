// The client's batch caps and the server's must agree: the extension and the
// server can't share a module, so nothing but this test stops them drifting
// apart, and drift means a push that is rejected forever.
// Run: node tests/sync-limits.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import { join } from "node:path";
import { SYNC_LIMITS } from "../shared/sync-map.js";

const schema = fs
  .readFileSync(join(import.meta.dirname, "../server/src/schema.ts"), "utf8")
  .replace(/\r\n/g, "\n");

const body = schema.slice(schema.indexOf("export const syncSchema"));
const end = body.indexOf("});");
const syncBody = body.slice(0, end);

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

test("every array the server caps is capped the same way on the client", () => {
  const found = {};
  for (const m of syncBody.matchAll(/(\w+):\s*z\.array\([^)]*\)\.max\((\d+)/g)) {
    found[m[1]] = Number(m[2]);
  }
  assert.ok(Object.keys(found).length > 0, "no caps found in syncSchema — did it move?");
  for (const [name, limit] of Object.entries(found)) {
    assert.equal(
      SYNC_LIMITS[name],
      limit,
      `server caps ${name} at ${limit}, SYNC_LIMITS says ${SYNC_LIMITS[name]} — a client would push batches the server rejects`
    );
  }
});

test("no array in the sync payload is left uncapped", () => {
  const arrays = [...syncBody.matchAll(/(\w+):\s*z\.array\(/g)].map((m) => m[1]);
  const capped = new Set([...syncBody.matchAll(/(\w+):\s*z\.array\([^)]*\)\.max\(/g)].map((m) => m[1]));
  for (const name of arrays) {
    assert.ok(capped.has(name), `${name} has no .max() — an unbounded array is a free denial of service`);
  }
});

console.log(`\n${passed} passed`);
