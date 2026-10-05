// Buttons, inputs, selects and textareas don't inherit the page font unless
// told to, so every control style that forgot to say so drew in the browser's
// default (Arial in Chrome on Windows): the capture dock, "All 5 sets", the
// review grade buttons, Import, Teams. One base rule fixes them all; this keeps
// it there, and keeps the deliberate monospace fields monospace.
// Run: node tests/control-fonts.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const css = fs.readFileSync(path.join(import.meta.dirname, "..", "src", "ui", "panel.css"), "utf8").replace(/\r\n/g, "\n");
let failures = 0;
function test(name, fn) {
  try { fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); }
}

// The block whose selector list is exactly the form controls.
const base = css.match(/(?:^|\n)((?:button|input|select|textarea)(?:,\s*(?:button|input|select|textarea))+)\s*\{([^}]*)\}/);

test("a base rule makes every form control inherit the page font", () => {
  assert.ok(base, "no `button, input, select, textarea { … }` rule");
  const sel = base[1].split(",").map((s) => s.trim()).sort();
  assert.deepEqual(sel, ["button", "input", "select", "textarea"]);
  // `font: inherit` is the shorthand: it inherits the family too.
  assert.match(base[2], /font(?:-family)?:\s*inherit/);
});

test("the base rule is a plain element selector, so class rules still win", () => {
  assert.doesNotMatch(base[1], /[.#:\[]/);
});

test("the deliberately monospace fields keep their own rule (a class beats the base)", () => {
  // Some selectors have several rules (.field textarea has three); one of
  // them must set the monospace family.
  const blocks = (sel) => [...css.matchAll(new RegExp(`${sel.replace(/\./g, "\\.")}\\s*\\{([^}]*)\\}`, "g"))].map((m) => m[1]);
  for (const sel of [".field textarea", ".code-input", ".share-code"]) {
    const found = blocks(sel);
    assert.ok(found.length, `${sel} rule missing`);
    assert.ok(found.some((b) => /font-family:\s*ui-monospace/.test(b)), `${sel} stays monospace`);
  }
});

test("Geist is still the page font, with the system sans behind it", () => {
  assert.match(css, /body\s*\{[^}]*font-family:\s*"Geist",\s*system-ui,\s*sans-serif/);
});

if (failures) { console.log(`\n${failures} failing`); process.exit(1); }
console.log("\nPASS control fonts");
