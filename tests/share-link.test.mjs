// Pure link helpers for per-set share links. The DOM isn't unit-tested here —
// only formatting, trimming, and parsing a code back out of a /s/{code} URL.
// Run: node tests/share-link.test.mjs

import assert from "node:assert/strict";
import { shareLinkFor, parseShareCode } from "../src/ui/share-link.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("shareLinkFor(code, base)");

test("joins base and code over the /s/ path", () => {
  assert.equal(shareLinkFor("7KX2M9QRTA", "https://mafsar.app"), "https://mafsar.app/s/7KX2M9QRTA");
});

test("trims whitespace around the code and trailing slashes off the base", () => {
  assert.equal(shareLinkFor("  7KX2M9QRTA ", "https://mafsar.app/"), "https://mafsar.app/s/7KX2M9QRTA");
  assert.equal(shareLinkFor("AB12", "https://mafsar.app///"), "https://mafsar.app/s/AB12");
});

test("keeps the code exactly as given (server codes are already uppercase)", () => {
  assert.equal(shareLinkFor("ab12cd", "https://x.test").split("/").pop(), "ab12cd");
});

test("empty base still produces a rooted /s/ path", () => {
  assert.equal(shareLinkFor("AB12", ""), "/s/AB12");
});

console.log("parseShareCode(urlOrCode)");

test("parses a code back out of a full /s/{code} URL", () => {
  assert.equal(parseShareCode("https://mafsar.app/s/7KX2M9QRTA"), "7KX2M9QRTA");
  assert.equal(parseShareCode("https://mafsar.app/s/AB12?utm=mail"), "AB12");
});

test("parses a bare code and uppercases it (user input is case-mixed)", () => {
  assert.equal(parseShareCode("7kx2m9qrta"), "7KX2M9QRTA");
  assert.equal(parseShareCode("  ab12 "), "AB12");
});

test("parses the code correctly even if the URL has multiple /s/ segments", () => {
  assert.equal(parseShareCode("https://my-school.edu/s/course/s/7KX2M9QRTA"), "7KX2M9QRTA");
});

test("parses a code back out of a full /S/{code} URL (case-insensitive path)", () => {
  assert.equal(parseShareCode("https://mafsar.app/S/7KX2M9QRTA"), "7KX2M9QRTA");
});



test("parses the legacy ?code= query form", () => {
  assert.equal(parseShareCode("https://mafsar.app/redeem?code=ab12"), "AB12");
  assert.equal(parseShareCode("https://mafsar.app/redeem?CODE=cd34"), "CD34");
});

test("empty or missing input yields an empty string, never undefined", () => {
  assert.equal(parseShareCode(""), "");
  assert.equal(parseShareCode(null), "");
  assert.equal(parseShareCode(undefined), "");
});

console.log(`\n${passed} tests passed`);
