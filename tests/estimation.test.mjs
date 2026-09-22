// Estimation drill grading. Run: node tests/estimation.test.mjs
//
// The learner's number is graded by this code, never by the model, so the
// parser and bands are the feature.
import assert from "node:assert/strict";
import { BANDS, gradeEstimation, mismatchNote, parseEstimation, parseReference, sameKind } from "../src/storage/estimation.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}
const close = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12) < 1e-9;
const v = (s) => parseEstimation(s)?.value;
const k = (s) => parseEstimation(s)?.kind;

console.log("numbers people type");
test("plain, grouped, scientific and decimal forms", () => {
  assert.equal(v("12"), 12);
  assert.equal(v("12,000"), 12000);
  assert.equal(v("1.2e4"), 12000);
  assert.equal(v(".5"), 0.5);
});
test("k / M / G shorthands and words", () => {
  assert.equal(v("12k"), 12000);
  assert.equal(v("3M users"), 3e6);
  assert.equal(v("1.5 million"), 1.5e6);
  assert.equal(v("2 bn"), 2e9);
  assert.equal(v("4 trillion"), 4e12);
});
test("count units are recognised, other words are not guessed at", () => {
  assert.equal(k("20 servers"), "count");
  assert.equal(parseEstimation("12 bananas"), null);
  assert.equal(parseEstimation("abc"), null);
  assert.equal(parseEstimation(""), null);
  assert.equal(parseEstimation(null), null);
});

console.log("data sizes and rates");
test("byte sizes with SI prefixes", () => {
  assert.equal(v("100 KB"), 1e5);
  assert.equal(v("300 TB"), 3e14);
  assert.equal(v("300TB"), 3e14);
  assert.equal(v("1 PB"), 1e15);
  assert.equal(k("300 TB"), "data");
});
test("bits vs bytes: lowercase b is bits", () => {
  assert.equal(v("10 Gb"), 1.25e9);
  assert.equal(v("10 GB"), 1e10);
  assert.equal(v("10 Gbps"), 1.25e9);
  assert.equal(k("10 Gbps"), "data_rate");
});
test("per-second and per-day data rates normalise to bytes/s", () => {
  assert.equal(v("2.5 GB/s"), 2.5e9);
  assert.ok(close(v("5 MB per day"), 5e6 / 86400));
  assert.equal(k("5 MB per day"), "data_rate");
});
test("trailing words after a data unit are fine", () => {
  assert.equal(v("4 TB of storage"), 4e12);
});

console.log("request rates");
test("QPS and req/day normalise to per second", () => {
  assert.equal(v("12k QPS"), 12000);
  assert.equal(k("12k QPS"), "rate");
  assert.ok(close(v("1M req/day"), 1e6 / 86400));
  assert.equal(v("50 req/s"), 50);
});
test("per month is a month, not a minute", () => {
  assert.ok(close(v("7 a month"), 7 / 2592000));
  assert.ok(close(v("5 per min"), 5 / 60));
  assert.ok(close(v("30 /month"), 30 / 2592000));
});

console.log("grading");
test("bands: within 2x spot on, within 10x ballpark, else off", () => {
  const ref = parseReference(300, "TB");
  assert.equal(BANDS.spot_on, 2);
  assert.equal(gradeEstimation(ref, parseEstimation("250 TB")), "spot_on");
  assert.equal(gradeEstimation(ref, parseEstimation("600 TB")), "spot_on");
  assert.equal(gradeEstimation(ref, parseEstimation("1 PB")), "ballpark");
  assert.equal(gradeEstimation(ref, parseEstimation("30 PB")), "off");
});
test("different units for the same quantity compare correctly", () => {
  assert.equal(gradeEstimation(parseReference(12000, "QPS"), parseEstimation("1 billion req/day")), "spot_on");
  assert.equal(gradeEstimation(parseReference(1.25, "GB/s"), parseEstimation("10 Gbps")), "spot_on");
});
test("mismatched kinds are off, with a note saying why", () => {
  const ref = parseReference(12000, "QPS");
  const ans = parseEstimation("12k");
  assert.equal(sameKind(ref, ans), false);
  assert.equal(gradeEstimation(ref, ans), "off");
  assert.match(mismatchNote(ref, ans), /rate per time/);
  assert.equal(mismatchNote(ref, parseEstimation("12k QPS")), "");
});
test("zero and negatives", () => {
  assert.equal(gradeEstimation(parseReference(0, ""), parseEstimation("0")), "spot_on");
  assert.equal(gradeEstimation(parseReference(10, ""), parseEstimation("-10")), "off");
  assert.equal(gradeEstimation(parseReference(10, ""), null), "off");
});

console.log(`\n${passed} passed`);
