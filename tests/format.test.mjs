import test from "node:test";
import assert from "node:assert";
import { formatAvg, formatCount } from "../shared/format.js";

test("formatAvg", () => {
  assert.strictEqual(formatAvg(4), "4.0");
  assert.strictEqual(formatAvg(4.1), "4.1");
  assert.strictEqual(formatAvg(4.19), "4.2");
});

test("formatCount", () => {
  assert.strictEqual(formatCount(0), "0");
  assert.strictEqual(formatCount(999), "999");
  assert.strictEqual(formatCount(1000), "1k");
  assert.strictEqual(formatCount(1200), "1.2k");
  assert.strictEqual(formatCount(1234), "1.2k");
  assert.strictEqual(formatCount(12000), "12k");
  assert.strictEqual(formatCount(999900), "999.9k");
  assert.strictEqual(formatCount(1000000), "1M");
  assert.strictEqual(formatCount(1200000), "1.2M");
});
