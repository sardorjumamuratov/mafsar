// Likely reasoning slips behind an estimate. Run: node tests/estimation-diagnose.test.mjs
import test from "node:test";
import assert from "node:assert";
import { diagnoseEstimation } from "../src/storage/estimation-diagnose.js";

test("diagnoseEstimation", async (t) => {
  await t.test("recognises prefix slips", () => {
    assert.match(diagnoseEstimation(1000, 1), /1,000/);
    assert.match(diagnoseEstimation(1, 1024), /1,000/);
    assert.match(diagnoseEstimation(1e6, 1), /million/);
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

  await t.test("recognises a missing peak factor only when the question asks for peak", () => {
    assert.strictEqual(diagnoseEstimation(40, 100, false), null);
    assert.match(diagnoseEstimation(40, 100, true), /peak/);
    assert.strictEqual(diagnoseEstimation(250, 100, true), null, "too high is not a forgotten peak factor");
  });

  await t.test("never explains an answer within 2x, which the grader calls correct", () => {
    assert.strictEqual(diagnoseEstimation(200, 100, true), null);
    assert.strictEqual(diagnoseEstimation(51, 100, true), null);
  });

  await t.test("returns null when unclear", () => {
    assert.strictEqual(diagnoseEstimation(7, 1), null);
    assert.strictEqual(diagnoseEstimation(1, 0), null);
    assert.strictEqual(diagnoseEstimation(NaN, 1), null);
  });
});
