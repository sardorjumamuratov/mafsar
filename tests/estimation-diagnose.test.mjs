import test from "node:test";
import assert from "node:assert";
import { diagnoseEstimation } from "../src/storage/estimation-diagnose.js";

test("diagnoseEstimation", async (t) => {
  await t.test("recognises prefix slip", () => {
    assert.match(diagnoseEstimation(1000, 1), /1,000/);
    assert.match(diagnoseEstimation(1, 1024), /1,000/);
  });
  
  await t.test("recognises bits vs bytes", () => {
    assert.match(diagnoseEstimation(8, 1), /bits and bytes/);
    assert.match(diagnoseEstimation(100, 800), /bits and bytes/);
  });
  
  await t.test("recognises time unit slips", () => {
    assert.match(diagnoseEstimation(24, 1), /24/);
    assert.match(diagnoseEstimation(100, 6000), /60/);
    assert.match(diagnoseEstimation(3600, 1), /3,600/);
    assert.match(diagnoseEstimation(1, 86400), /86,400/);
  });
  
  await t.test("recognises peak vs average only when flagged", () => {
    assert.strictEqual(diagnoseEstimation(200, 100, false), null);
    assert.match(diagnoseEstimation(200, 100, true), /peak vs average/);
  });
  
  await t.test("returns null when unclear", () => {
    assert.strictEqual(diagnoseEstimation(7, 1), null);
    assert.strictEqual(diagnoseEstimation(1, 0), null);
  });
});
