// The You tab (docs/prompts: "Fix the You tab"): one 16px edge, a profile
// card, grouped settings rows, a switch at the row's end, and no figures that
// belong to Stats.
// Run: node tests/you-tab.test.mjs
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

const you = read("src/ui/views/you.js");
const css = read("src/ui/panel.css");
const panel = read("src/ui/panel.js");
// The You screen's own markup: renderYou and its helpers, not the auth gate.
const screen = you.slice(you.indexOf("// ===== YOU TAB"), you.indexOf("// ===== SIGN-IN SCREEN"));

test("the screen section is marked", () => assert.ok(screen.length > 500));

test("no stats on You: they belong to the Stats tab", () => {
  assert.doesNotMatch(screen, /Your stats/);
  assert.doesNotMatch(screen, /mastered/i);
  assert.doesNotMatch(screen, /summarize\(|computeStreak\(/);
});

test("same scroll container as Sets: column, gap 14, padding 18px 16px 24px", () => {
  assert.match(screen, /class="screen" data-view="you" style="padding:18px 16px 24px;gap:14px"/);
});

test("groups use SectionLabel: Plan, Study, Preferences, Data, Account", () => {
  assert.match(screen, /function group\(label, rows\) \{[^}]*SectionLabel\(label\)/, "every group's label is a SectionLabel");
  for (const g of ["Plan", "Study", "Preferences", "Data", "Account"]) assert.ok(screen.includes(`group("${g}"`), g);
  assert.doesNotMatch(screen, /"Layout"|"Backup"|"Progress"/);
});

test("no unicode arrows, emoji or a star for the plan", () => {
  assert.doesNotMatch(you, /[⇩⇧⇪↓↑★☆]/u);
  assert.doesNotMatch(screen, /M12 2l3\.09 6\.26/, "the star path means ratings");
  assert.match(screen, /M13 2L4\.5 13\.5H12L11 22l8\.5-11\.5H12z/, "lightning bolt");
});

test("Open in a tab is a row switch with role=switch and aria-checked", () => {
  assert.match(screen, /role="switch"/);
  assert.match(screen, /aria-checked="\$\{/);
  assert.match(panel, /case "open-in-tab"/);
  assert.match(css, /\.you-switch\s*\{[^}]*width:\s*44px;[^}]*height:\s*26px/);
  assert.match(css, /\.you-switch::after\s*\{[^}]*transition:\s*left 150ms ease/);
});

test("red only on Delete account", () => {
  const reds = screen.match(/var\(--danger-text\)/g) || [];
  assert.equal(reds.length, 2, "the trash icon and the title");
  const del = screen.slice(screen.indexOf('data-action="delete-account-open"') - 200, screen.indexOf('data-action="delete-account-open"') + 900);
  assert.ok((del.match(/var\(--danger-text\)/g) || []).length === 2, "both inside the Delete account row");
});

test("only 24, 15, 14 and 13px type on the screen", () => {
  const sizes = new Set([...screen.matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1])));
  for (const s of sizes) assert.ok([24, 15, 14, 13].includes(s), `font-size ${s}px`);
});

test("the plan, sign out and backup are rows, not standalone buttons", () => {
  assert.doesNotMatch(screen, /btn btn-ghost btn-block/);
  assert.doesNotMatch(screen, /class="btn /);
});

// --- logic ---------------------------------------------------------------------
global.document = { getElementById: () => null, addEventListener: () => {}, querySelector: () => null };
global.window = {};
global.DOMParser = class { parseFromString() { return { body: { childNodes: [] } }; } };
global.chrome = { storage: { local: { get: (k, cb) => cb({}) }, onChanged: { addListener() {} } }, runtime: { getURL: (p) => p, onMessage: { addListener() {} } }, tabs: { onRemoved: { addListener() {} } } };
const mod = await import("../src/ui/views/you.js");

test("backup status reads as relative time", () => {
  const now = Date.parse("2026-10-05T12:00:00");
  assert.equal(mod.backupStatus(null, now), "Not backed up yet");
  assert.equal(mod.backupStatus(new Date(now - 20_000).toISOString(), now), "Backed up just now");
  assert.equal(mod.backupStatus(new Date(now - 5 * 60_000).toISOString(), now), "Backed up 5 min ago");
  assert.equal(mod.backupStatus(new Date(now - 3 * 3_600_000).toISOString(), now), "Backed up 3 h ago");
  assert.equal(mod.backupStatus(new Date(now - 30 * 3_600_000).toISOString(), now), "Backed up yesterday");
  assert.equal(mod.backupStatus("2026-09-12T08:00:00", now), "Backed up Sep 12");
});

test("the avatar is never empty", () => {
  assert.equal(mod.avatarLetter("sardor@example.com"), "S");
  assert.equal(mod.avatarLetter(""), "?");
  assert.equal(mod.avatarLetter(undefined), "?");
});

if (failures) { console.log(`\n${failures} failing`); process.exit(1); }
console.log("\nPASS you tab");
