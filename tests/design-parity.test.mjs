// The five screens against docs/design/0N-*.html, and the bugs that kept them
// from looking like it: things a browser shows at a glance but no unit test
// saw. Static where it has to be (the views need a DOM), logic where it can be.
// Run: node tests/design-parity.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
let failures = 0;
function test(name, fn) {
  try { fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); }
}

function walkJs(dir) {
  const out = [];
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkJs(rel));
    else if (e.name.endsWith(".js")) out.push(rel);
  }
  return out;
}

const css = read("src/ui/panel.css");
const html = read("src/ui/panel.html");
// The dark palette is the one the references are drawn in.
const darkBlock = css.slice(css.indexOf("@media (prefers-color-scheme: dark)"));

test("no helper calls itself as its own body (set-detail's byId did, so every paint overflowed)", () => {
  for (const f of walkJs("src")) {
    for (const line of read(f).split("\n")) {
      const m = line.match(/^\s*const (\w+) = \([^)]*\) =>(.*)$/);
      if (m && new RegExp(`\\b${m[1]}\\(`).test(m[2])) assert.fail(`${f}: ${line.trim()}`);
    }
  }
});

test("setNav toggles the class the stylesheet highlights", () => {
  const nav = read("src/ui/nav.js");
  assert.match(css, /\.nav-item\.active\s*\{/);
  assert.match(nav, /toggle\("active"/, "setNav must toggle .active (it toggled .on, which nothing styles)");
});

test("every showChrome call says whether the chrome shows (no argument hid the nav on Sets)", () => {
  for (const f of walkJs("src/ui")) {
    const bare = read(f).match(/showChrome\(\s*\)/);
    assert.equal(bare, null, `${f} calls showChrome() with no argument`);
  }
});

test("set rows don't carry the legacy .setrow class (its column layout stacked the tile over the title)", () => {
  const row = read("src/ui/set-row.js");
  assert.doesNotMatch(row, /class="[^"]*\bsetrow\b/);
  assert.doesNotMatch(read("src/ui/views/sets.js"), /'\.setrow'/);
});

test("bottom nav and capture dock use the reference icons", () => {
  for (const d of [
    "M4 10.5L12 4l8 6.5V20h-5v-6H9v6H4z",           // Home
    "M4 7h16M4 12h16M4 17h16",                       // Sets
    "M15.5 8.5l-2 5-5 2 2-5z",                       // Discover
    "M5 20v-8M12 20V5M19 20v-5",                     // Stats
    "M4 20.5c.8-4 4-6 8-6s7.2 2 8 6",                // You
    "M4 9V5a1 1 0 011-1h4M15 4h4a1 1 0 011 1v4M20 15v4a1 1 0 01-1 1h-4M9 20H5a1 1 0 01-1-1v-4", // Capture page
    "M5 5h14a1 1 0 011 1v9a1 1 0 01-1 1H10l-4 3.5V16H5a1 1 0 01-1-1V6a1 1 0 011-1z",           // Capture answer
  ]) assert.ok(html.includes(d), `panel.html is missing ${d}`);
  assert.match(css, /\.nav-icon svg\s*\{[^}]*width:\s*20px/);
});

test("dark tokens match the references", () => {
  for (const [name, value] of [
    ["--status-mastered", "#5fd3c5"], // How it works dot, Stats legend
    ["--rating-star", "#cfd9d6"],     // stars on rows, detail and Discover
    ["--src-yt-bg", "#27322f"], ["--src-yt-fg", "#e7eeec"],
    ["--overlay", "rgba(0,0,0,0.6)"],
  ]) assert.match(darkBlock, new RegExp(`${name}:\\s*${value.replace(/[().]/g, "\\$&")}`), name);
});

test("the shared sheet dims what's behind it and pads like the references", () => {
  assert.match(css, /\.sheet\s*\{[^}]*background:\s*var\(--overlay\)/);
  assert.match(css, /\.sheet-panel\s*\{[^}]*padding:\s*10px var\(--sheet-px/);
});

test("the due count on a set row is primary text, not amber", () => {
  assert.match(css, /\.due-count\s*\{[^}]*color:\s*var\(--text-primary\)/);
});

test("toast actions take the toast's action colour (no inline override)", () => {
  const core = read("src/ui/core.js");
  assert.doesNotMatch(core, /class="toast-action" style=/);
  assert.match(css, /\.toast-action\s*\{[^}]*color:\s*var\(--toast-action\)/);
});

test("Discover uses the segmented control and set rows, not chips", () => {
  const g = read("src/ui/views/global.js");
  assert.doesNotMatch(g, /class="tag /);
  assert.match(g, /placeholder="Search global sets"/);
  assert.match(g, /Picked because you study/);
});

test("Set detail top bar: bordered 40px buttons, horizontal ⋯", () => {
  const d = read("src/ui/views/set-detail.js");
  assert.match(d, /<circle cx="5" cy="12" r="1\.8"/);
  assert.match(d, /M4 20h4L19 9l-4-4L4 16z/, "Edit icon");
  assert.match(d, /M7 4\.5v15l12-7\.5z/, "play icon on the primary button");
  assert.match(d, /Tapping <b>Again<\/b> shows the card later/);
});

test("the inline editor is wired on every paint, not only after tapping a row", () => {
  const d = read("src/ui/views/set-detail.js");
  const bind = d.slice(d.indexOf("function bindEvents()"));
  const rowHandler = bind.slice(bind.indexOf(".card-row-btn"), bind.indexOf(".chevron-btn"));
  assert.doesNotMatch(rowHandler, /bindEditorEvents/);
  assert.match(bind, /bindEditorEvents\(/);
});

// --- Stats logic ---------------------------------------------------------------
global.document = { getElementById: () => null, addEventListener: () => {}, querySelector: () => null };
global.window = {};
global.DOMParser = class { parseFromString() { return { body: { childNodes: [] } }; } };
const stats = await import("../src/ui/views/stats.js");

test("Studied counts 22 s for a review without durationMs (spec 10)", () => {
  const ms = stats.studiedMs([{ durationMs: 60_000 }, {}, { durationMs: null }]);
  assert.equal(ms, 60_000 + 2 * 22_000);
});

test("All cards counts with the scheduler's own mastery, not interval/dueDate guesses", () => {
  const c = stats.cardCounts([
    {},                                                // new
    { repetitions: 1, state: "learning", stability: 1 }, // learning
    { state: "review", stability: 12 },                // mastered
    { deleted: true, state: "review", stability: 12 }, // tombstone: not counted
  ]);
  assert.deepEqual(c, { new: 1, learning: 1, mastered: 1 });
});

test("Stats legend has real dots, not mojibake", () => {
  const s = read("src/ui/views/stats.js");
  assert.doesNotMatch(s, /\?<\/span> /);
  assert.match(s, /Send feedback about the app/);
});

if (failures) { console.log(`\n${failures} failing`); process.exit(1); }
console.log("\nPASS design parity");
