// Coding-mode submission sizing. Run: node tests/coding.test.mjs
//
// The cap is the only thing that blocks submission, so its boundary matters:
// off-by-one here either rejects a legal submission or lets one through that
// the server then 400s, after the user has already written it.

import assert from "node:assert/strict";
import { codeSize, codeLineCount, MAX_CODE_CHARS } from "../src/storage/coding.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("codeLineCount");

test("counts only lines with real code", () => {
  assert.equal(codeLineCount("int a = 1;\n\n// note\nint b = 2;"), 2);
});

test("ignores the comment styles the four target languages use", () => {
  assert.equal(codeLineCount("// js\n# py\n-- sql\n/* open\n * mid\n */\ncode();"), 1);
});

test("handles CRLF, so a Windows paste counts the same", () => {
  assert.equal(codeLineCount("a\r\n\r\nb\r\n"), 2);
});

test("is 0 for empty and whitespace-only input", () => {
  assert.equal(codeLineCount(""), 0);
  assert.equal(codeLineCount("   \n\t\n"), 0);
  assert.equal(codeLineCount(null), 0);
});

console.log("codeSize — the cap boundary");

test("exactly at the cap is allowed", () => {
  const s = codeSize("x".repeat(MAX_CODE_CHARS), 15);
  assert.equal(s.chars, MAX_CODE_CHARS);
  assert.equal(s.overCap, false, "the server accepts exactly 4000, so the client must too");
  assert.equal(s.remaining, 0);
});

test("one character over the cap blocks", () => {
  const s = codeSize("x".repeat(MAX_CODE_CHARS + 1), 15);
  assert.equal(s.overCap, true);
  assert.equal(s.remaining, -1);
});

test("counts characters, not lines — a one-line paste can still exceed the cap", () => {
  const s = codeSize("x".repeat(MAX_CODE_CHARS + 500), 15);
  assert.equal(s.lines, 1);
  assert.equal(s.overCap, true, "a single enormous line must not slip past a line-based check");
});

console.log("codeSize — the target is advisory, never a gate");

test("well over the target is flagged verbose but never over the cap", () => {
  const s = codeSize(Array.from({ length: 80 }, (_, i) => `line${i}();`).join("\n"), 15);
  assert.equal(s.lines, 80);
  assert.equal(s.verbose, true);
  assert.equal(s.overCap, false, "verbosity is graded, not blocked");
});

test("at exactly 2x the target is not yet flagged", () => {
  const s = codeSize(Array.from({ length: 30 }, (_, i) => `line${i}();`).join("\n"), 15);
  assert.equal(s.ratio, 2);
  assert.equal(s.verbose, false);
});

test("ratio is reported against the task's own expectation", () => {
  const code = Array.from({ length: 10 }, (_, i) => `line${i}();`).join("\n");
  assert.equal(codeSize(code, 20).ratio, 0.5);
  assert.equal(codeSize(code, 5).ratio, 2);
});

console.log("codeSize — degenerate input");

test("empty is flagged so submit stays disabled on a blank editor", () => {
  assert.equal(codeSize("", 15).empty, true);
  assert.equal(codeSize("  \n\n", 15).empty, true);
  assert.equal(codeSize("x", 15).empty, false);
});

test("a missing or bogus expectedLines falls back instead of dividing by zero", () => {
  assert.equal(codeSize("a\nb", 0).expected, 15);
  assert.equal(codeSize("a\nb", undefined).expected, 15);
  assert.equal(Number.isFinite(codeSize("a\nb", 0).ratio), true);
});

console.log(`\n${passed} tests passed`);
