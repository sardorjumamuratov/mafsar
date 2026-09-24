// A background sync repaints the panel when it pulls something. It must never
// do that while the learner is inside a focus view — a repaint mid-drill throws
// the session away, and mid-teach it throws away what they were typing.
//
// The first version of this guard read a CSS class off the bottom nav, which
// meant any flow that forgot showChrome(false) was silently unprotected. The
// chain drill was one, and a sync did interrupt it.
// Run: node tests/focus-view.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const here = import.meta.dirname;
const read = (p) => fs.readFileSync(path.join(here, p), "utf8").replace(/\r\n/g, "\n");

function walkJs(dir) {
  const out = [];
  for (const entry of fs.readdirSync(path.join(here, dir), { withFileTypes: true })) {
    if (entry.isDirectory()) out.push(...walkJs(path.join(dir, entry.name)));
    else if (entry.name.endsWith(".js")) out.push(path.join(dir, entry.name));
  }
  return out;
}

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

test("the repaint asks whether a focus view is open, not what the nav looks like", () => {
  const panel = read("../src/ui/panel.js");
  const listener = panel.slice(panel.indexOf("SYNC_PULLED_EVENT, () =>"));
  const body = listener.slice(0, listener.indexOf("});"));
  assert.ok(body.includes("inFocusView()"), "the guard must ask nav.js directly");
  assert.ok(
    !/nav.classList/.test(body),
    "reading the nav's class misses any flow that forgot to hide it"
  );
});

test("showChrome is the single record of being inside a focus view", () => {
  const nav = read("../src/ui/nav.js");
  assert.ok(nav.includes("export function inFocusView"), "nav.js owns the flag");
  const fn = nav.slice(nav.indexOf("export function showChrome"));
  assert.ok(fn.slice(0, fn.indexOf("}")).includes("focusView"), "showChrome must set it, or it goes stale");
});

test("every flow that takes over the screen hides the chrome", () => {
  // If it paints over the whole panel and offers its own way out, it is a focus
  // view: the nav must go, and the repaint guard must see it.
  const missing = [];
  for (const file of walkJs("../src/ui/flows")) {
    const src = read(file);
    const takesOver = src.includes("setFocusReturn(");
    if (takesOver && !src.includes("showChrome(false)")) missing.push(file.replace(/\\/g, "/"));
  }
  assert.deepEqual(missing, [], "these take over the screen without hiding the nav: " + missing.join(", "));
});

test("a drill still gives the learner a way out once the nav is gone", () => {
  for (const file of walkJs("../src/ui/flows")) {
    const src = read(file);
    if (!src.includes("showChrome(false)")) continue;
    assert.ok(
      /XBTN|close-focus|nav-back|-cancel|data-action="back/.test(src),
      file + " hides the nav without rendering an exit"
    );
  }
});

console.log(`\n${passed} passed`);
