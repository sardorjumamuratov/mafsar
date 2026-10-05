// Ratings are for global sets, by someone who didn't make them: no stars on a
// set you made (private or published), stars only on a copy from Discover,
// and the average, never "yours", on a row. Rating your own set tells you
// nothing, and your own vote only inflates what everyone else sees.
// Run: node tests/ratings-global-only.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ratingMode } from "../shared/rating-mode.js";

const root = path.join(import.meta.dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
let failures = 0;
function test(name, fn) {
  try { fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); }
}

test("a private set of yours: no rating at all", () => {
  assert.equal(ratingMode({ originSetId: null, isGlobal: false }), "none");
});

test("a set of yours that you published: the average, read-only", () => {
  assert.equal(ratingMode({ originSetId: null, isGlobal: true }), "summary");
});

test("a copy from Discover: you can rate it", () => {
  assert.equal(ratingMode({ originSetId: "root1", isGlobal: true }), "rate");
});

test("a copy whose original is no longer global: nothing to rate", () => {
  assert.equal(ratingMode({ originSetId: "root1", isGlobal: false }), "none");
});

const detail = read("src/ui/views/set-detail.js");
const row = read("src/ui/set-row.js");

test("set detail draws stars only for mode 'rate', and a read-only line for 'summary'", () => {
  assert.match(detail, /import \{ ratingMode \} from "\.\.\/\.\.\/\.\.\/shared\/rating-mode\.js"/);
  assert.match(detail, /ratingMode\(\{ originSetId: studySet\.originSetId, isGlobal: ratingData\.isGlobal \}\)/);
  assert.match(detail, /mode === "rate"/);
  // The else branch of mode === "rate": a line with a star icon and no buttons.
  const summary = detail.slice(detail.indexOf('class="rating-summary"'), detail.indexOf('class="rating-summary"') + 600);
  assert.ok(summary.includes('class="rating-summary"'), "a read-only summary exists");
  assert.doesNotMatch(summary, /<button/);
});

test("the old private-set wording is gone", () => {
  assert.doesNotMatch(detail, /Your rating ·/);
  assert.doesNotMatch(detail, /Tap to rate/);
  assert.doesNotMatch(detail, /Every set can be rated/);
});

test("a row shows the average of a global set, never 'yours'", () => {
  assert.doesNotMatch(row, /yours/);
  assert.doesNotMatch(row, /yourStars/);
  assert.match(row, /r\?\.isGlobal/);
});

test("rating a copy before its first lookup keeps its stars (the new entry is global)", () => {
  const store = read("src/storage/ratings.js");
  const write = store.slice(store.indexOf("async function write("), store.indexOf("export function rateSet"));
  assert.match(write, /cache\[rootId\] = \{[^}]*isGlobal: true/);
});

test("a copy of an unpublished original isn't called Global on its row", () => {
  assert.match(row, /set\.originSetId && r \? !!r\.isGlobal/);
});

if (failures) { console.log(`\n${failures} failing`); process.exit(1); }
console.log("\nPASS ratings global only");
