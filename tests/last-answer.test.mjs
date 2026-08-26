// Last-answer extraction. Run: node tests/last-answer.test.mjs
//
// This is the whole feature's decision layer: which turn gets captured, whether
// the question rides along, and whether a capture is allowed to spend one of the
// free plan's 3 monthly generations. The DOM reading stays in the site adapters,
// so everything worth testing lives here.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The module is a classic script (content scripts can't use import), so load it
// the way the browser does: evaluate it and read the global it attaches.
const src = readFileSync(new URL("../src/storage/last-answer.js", import.meta.url), "utf8");
new Function(src)();
const { extractLastAnswer, cleanAnswerText, answerMessages, MIN_ANSWER_CHARS } =
  /** @type {any} */ (globalThis).__mafsarLastAnswer;

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const long = (prefix = "") => prefix + "x".repeat(MIN_ANSWER_CHARS);

console.log("extractLastAnswer");

test("picks the last assistant turn, not the first", () => {
  const r = extractLastAnswer([
    { role: "user", text: "first question" },
    { role: "assistant", text: long("EARLY ") },
    { role: "user", text: "second question" },
    { role: "assistant", text: long("LATEST ") },
  ]);
  assert.equal(r.ok, true);
  assert.ok(r.answer.startsWith("LATEST"));
});

test("pairs the question immediately before the answer, not an earlier one", () => {
  const r = extractLastAnswer([
    { role: "user", text: "old question" },
    { role: "assistant", text: long() },
    { role: "user", text: "the right question" },
    { role: "assistant", text: long() },
  ]);
  assert.equal(r.question, "the right question");
});

test("an unanswered trailing user message still yields the last answered pair", () => {
  const r = extractLastAnswer([
    { role: "user", text: "answered question" },
    { role: "assistant", text: long() },
    { role: "user", text: "just sent, no reply yet" },
  ]);
  assert.equal(r.ok, true);
  assert.equal(r.question, "answered question");
});

test("skips a blank assistant turn to reach a real one", () => {
  const r = extractLastAnswer([
    { role: "user", text: "q" },
    { role: "assistant", text: long() },
    { role: "assistant", text: "   " },
  ]);
  assert.equal(r.ok, true);
});

test("question is null when the thread opens with the assistant", () => {
  const r = extractLastAnswer([{ role: "assistant", text: long() }]);
  assert.equal(r.ok, true);
  assert.equal(r.question, null);
});

console.log("refusals");

test("no-answer when there are only user turns", () => {
  assert.deepEqual(extractLastAnswer([{ role: "user", text: "hello" }]), {
    ok: false,
    reason: "no-answer",
  });
});

test("no-answer on an empty or junk list", () => {
  assert.equal(extractLastAnswer([]).reason, "no-answer");
  assert.equal(extractLastAnswer(null).reason, "no-answer");
});

test("too-short one character under the minimum", () => {
  const r = extractLastAnswer([{ role: "assistant", text: "x".repeat(MIN_ANSWER_CHARS - 1) }]);
  assert.deepEqual(r, { ok: false, reason: "too-short" });
});

test("exactly the minimum is allowed through", () => {
  const r = extractLastAnswer([{ role: "assistant", text: "x".repeat(MIN_ANSWER_CHARS) }]);
  assert.equal(r.ok, true);
});

test("length is judged after cleaning, so stripped chrome can't pad it", () => {
  const body = "x".repeat(MIN_ANSWER_CHARS - 5);
  const r = extractLastAnswer([{ role: "assistant", text: body + "\nCopy code\nCopy code" }]);
  assert.deepEqual(r, { ok: false, reason: "too-short" });
});

console.log("title");

test("titles from the question", () => {
  const r = extractLastAnswer([
    { role: "user", text: "Why is mergesort O(n log n)?" },
    { role: "assistant", text: long() },
  ]);
  assert.equal(r.title, "Why is mergesort O(n log n)?");
});

test("collapses whitespace in the question", () => {
  const r = extractLastAnswer([
    { role: "user", text: "  What   is\n\nTCP?  " },
    { role: "assistant", text: long() },
  ]);
  assert.equal(r.title, "What is TCP?");
});

test("caps a long title on a word boundary", () => {
  const q = "word ".repeat(40).trim();
  const r = extractLastAnswer([
    { role: "user", text: q },
    { role: "assistant", text: long() },
  ]);
  assert.ok(r.title.length <= 81, `got ${r.title.length}`);
  assert.ok(r.title.endsWith("…"));
  assert.ok(!r.title.includes("wor…"), "must not cut mid-word");
});

test("falls back to the answer's first sentence when there is no question", () => {
  const r = extractLastAnswer([
    { role: "assistant", text: "A monad is a monoid in the category of endofunctors. " + long() },
  ]);
  assert.equal(r.title, "A monad is a monoid in the category of endofunctors.");
});

console.log("cleanAnswerText");

test("drops a standalone Copy code line", () => {
  assert.equal(cleanAnswerText("before\nCopy code\nafter"), "before\nafter");
});

test("leaves the word alone inside a sentence", () => {
  const s = "You can copy code from the clipboard.";
  assert.equal(cleanAnswerText(s), s);
});

test("collapses runs of blank lines but keeps paragraph breaks", () => {
  assert.equal(cleanAnswerText("a\n\n\n\nb"), "a\n\nb");
  assert.equal(cleanAnswerText("a\n\nb"), "a\n\nb");
});

test("never reformats code", () => {
  const code = "function f() {\n    return 1;\n}";
  assert.equal(cleanAnswerText(code), code);
});

console.log("answerMessages");

test("sends the question and answer as a pair", () => {
  assert.deepEqual(answerMessages("q", "a"), [
    { role: "user", text: "q" },
    { role: "assistant", text: "a" },
  ]);
});

test("sends the answer alone when there is no question", () => {
  assert.deepEqual(answerMessages(null, "a"), [{ role: "assistant", text: "a" }]);
});

console.log(`\n${passed} passed`);
