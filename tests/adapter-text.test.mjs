// readText: an element's text without the names of its icon glyphs.
// Run: node tests/adapter-text.test.mjs
//
// Google's chat UIs render icons with Material Symbols, whose text nodes are
// the icon's name ("edit", "more_vert"). Reading a turn with innerText pulled
// those names in, and a captured question became the set title
// "edit more_vert". These cases pin the DOM-side fix.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// adapter.js is a classic content script that attaches to window.__mafsar.
const src = readFileSync(new URL("../src/content/adapters/adapter.js", import.meta.url), "utf8");
const win = /** @type {any} */ ({});
new Function("window", src)(win);
const { readText } = win.__mafsar;

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

/** Stand-in for a DOM element: its rendered text plus the icon glyphs inside it. */
const el = (innerText, icons = []) => ({
  innerText,
  querySelectorAll: () => icons.map((textContent) => ({ textContent })),
});

console.log("readText");

test("drops icon names that innerText put on their own lines", () => {
  assert.equal(readText(el("edit\nmore_vert\nWhat is TCP?", ["edit", "more_vert"])), "What is TCP?");
});

test("drops icon names that share one line", () => {
  assert.equal(readText(el("edit more_vert\nWhat is TCP?", ["edit", "more_vert"])), "What is TCP?");
});

test("keeps a sentence that contains an icon's name", () => {
  const s = "How do I edit a file in vim?";
  assert.equal(readText(el(s, ["edit"])), s);
});

test("only strips icons this element actually contains", () => {
  const s = "more_vert\nreal text";
  assert.equal(readText(el(s, [])), s);
});

test("keeps paragraph breaks and code", () => {
  assert.equal(
    readText(el("para one\n\nconst user_id = 1;\nmore_vert", ["more_vert"])),
    "para one\n\nconst user_id = 1;"
  );
});

test("ignores icon elements whose text is not a glyph name", () => {
  const s = "Copy code\nx";
  assert.equal(readText(el(s, ["Copy code"])), s);
});

test("returns an empty string for a missing element", () => {
  assert.equal(readText(null), "");
  assert.equal(readText(undefined), "");
});

console.log(`\n${passed} passed`);
