
import assert from "node:assert/strict";
import { parseEstimation, gradeEstimation } from "../src/storage/estimation.js";

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  - ${name}`);
  } catch(e) {
    console.error(`FAIL: ${name}`);
    console.error(e);
    process.exit(1);
  }
}

test("parses basic numbers", () => {
  assert.equal(parseEstimation("12").value, 12);
  assert.equal(parseEstimation("-5.5").value, -5.5);
  assert.equal(parseEstimation("0").value, 0);
  assert.equal(parseEstimation("1.2e4").value, 12000);
  assert.equal(parseEstimation("12,000").value, 12000);
});

test("parses word multipliers", () => {
  assert.equal(parseEstimation("1.5 million").value, 1500000);
  assert.equal(parseEstimation("2 billion").value, 2000000000);
  assert.equal(parseEstimation("3 trillion").value, 3000000000000);
});

test("parses suffix multipliers", () => {
  assert.equal(parseEstimation("12k").value, 12000);
  assert.equal(parseEstimation("5M").value, 5000000);
  assert.equal(parseEstimation("2G").value, 2000000000);
  assert.equal(parseEstimation("1T").value, 1000000000000);
});

test("parses bytes and bits", () => {
  // Base is bytes
  assert.equal(parseEstimation("10 B").value, 10);
  assert.equal(parseEstimation("2 KB").value, 2000);
  assert.equal(parseEstimation("2 MB").value, 2000000);
  assert.equal(parseEstimation("2 GB").value, 2000000000);
  
  // Bits are 1/8 of a byte
  assert.equal(parseEstimation("16 bits").value, 2);
  assert.equal(parseEstimation("16 Kbps").value, 2000); // 16 Kbps = 2 KB/s (ignoring time for now)
});

test("parses time rates into per-second base", () => {
  // 1 day = 86400 seconds. If they say "86400 B / day", it should normalize to 1 B/s
  assert.equal(parseEstimation("86400 B/day").value, 1);
  assert.equal(parseEstimation("60 MB / min").value, 1000000);
  assert.equal(parseEstimation("3600 requests / hour").value, 1);
});

test("grades bands correctly", () => {
  // ratio = Math.max(a/b, b/a)
  assert.equal(gradeEstimation(parseEstimation("100"), parseEstimation("150")), "spot_on"); // 1.5x
  assert.equal(gradeEstimation(parseEstimation("100"), parseEstimation("50")), "spot_on");  // 2x
  assert.equal(gradeEstimation(parseEstimation("100"), parseEstimation("49")), "ballpark"); // 2.04x
  assert.equal(gradeEstimation(parseEstimation("100"), parseEstimation("900")), "ballpark"); // 9x
  assert.equal(gradeEstimation(parseEstimation("100"), parseEstimation("10")), "ballpark"); // 10x
  assert.equal(gradeEstimation(parseEstimation("100"), parseEstimation("9")), "off"); // 11x
  assert.equal(gradeEstimation(parseEstimation("100"), parseEstimation("1000")), "ballpark");
});

test("returns null for unparseable input", () => {
  assert.equal(parseEstimation("garbage"), null);
  assert.equal(parseEstimation("million"), null);
});

console.log(`\n${passed} passed`);

