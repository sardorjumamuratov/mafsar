// Quiz-length picker rules. Run: node tests/quiz-lengths.test.mjs
// Quick = fixed 5 · Half = half the set rounded to the nearest 5 · Full = all,
// each capped by the questions actually stored; under 20 cards one Full quiz.

import assert from "node:assert/strict";
import { quizLengths } from "../src/ui/quiz-lengths.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

test("40 cards → 5 / 20 / 40", () => {
  assert.deepEqual(quizLengths(40, 40), [["Quick", 5], ["Half", 20], ["Full", 40]]);
});

test("30 cards → 5 / 15 / 30", () => {
  assert.deepEqual(quizLengths(30, 30), [["Quick", 5], ["Half", 15], ["Full", 30]]);
});

test("29 cards → 5 / 15 / 29 (half rounds up to the nearest 5)", () => {
  assert.deepEqual(quizLengths(29, 29), [["Quick", 5], ["Half", 15], ["Full", 29]]);
});

test("26 cards → 5 / 15 / 26 (13 rounds to 15)", () => {
  assert.deepEqual(quizLengths(26, 26), [["Quick", 5], ["Half", 15], ["Full", 26]]);
});

test("22 cards → 5 / 10 / 22 (11 rounds down to 10)", () => {
  assert.deepEqual(quizLengths(22, 22), [["Quick", 5], ["Half", 10], ["Full", 22]]);
});

test("under 20 cards → single Full quiz", () => {
  assert.deepEqual(quizLengths(19, 19), [["Full", 19]]);
  assert.deepEqual(quizLengths(6, 6), [["Full", 6]]);
  assert.deepEqual(quizLengths(20, 20), [["Quick", 5], ["Half", 10], ["Full", 20]], "exactly 20 gets the picker");
});

test("options cap at the stored question count", () => {
  // 40-card set that only stored 8 questions: Quick stays 5, the rest cap to 8.
  assert.deepEqual(quizLengths(40, 8), [["Quick", 5], ["Full", 8]]);
  // Everything collapses when barely any questions exist.
  assert.deepEqual(quizLengths(30, 5), [["Full", 5]]);
  assert.deepEqual(quizLengths(30, 3), [["Full", 3]]);
});

test("no stored questions → no options", () => {
  assert.deepEqual(quizLengths(30, 0), []);
});

console.log(`\n${passed} tests passed`);
