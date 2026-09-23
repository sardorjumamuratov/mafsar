import fs from "node:fs";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert";

test("a large-but-legitimate library syncing successfully", () => {
  const read = (p) => fs.readFileSync(join(import.meta.dirname, p), "utf8").replace(/\r\n/g, "\n");
  const sync = read("../src/sync/sync.js");

  assert.ok(sync.includes("function chunk"), "sync.js must implement chunking");
  assert.ok(sync.includes("const maxChunks"), "sync.js must calculate maxChunks");
  assert.ok(sync.includes("for (let i = 0; i < maxChunks; i++)"), "sync.js must iterate chunks");
  assert.ok(sync.includes("body: JSON.stringify({ since: currentSince"), "sync.js must pass updated since for each chunk");
  assert.ok(sync.includes("local = applyServer"), "sync.js must fold applyServer results");
  assert.ok(sync.includes("totalPushed"), "sync.js must sum pushed counts");
});
