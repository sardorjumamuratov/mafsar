// Static guards for panel behaviors that need a real browser to *see*, but
// whose wiring can be asserted from source. Complements the hand-check.
// Run: node tests/ui-static.test.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/ui/panel.js", import.meta.url), "utf8");
let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("scroll reset wiring (item 2)");

test("topOfView() is defined exactly once and resets #app", () => {
  const defs = src.match(/function topOfView\(\)/g) || [];
  assert.equal(defs.length, 1);
  assert.ok(src.includes("app.scrollTop = 0"));
});

test("every view renderer resets scroll after painting", () => {
  // Each renderer's setHTML(...) is followed by topOfView().
  const callSites = src.split("topOfView();").length - 1;
  assert.ok(callSites >= 9, `expected >=9 call sites, found ${callSites}`);
  // renderSetDetail resets AFTER paintDetail (tab switches covered) — the
  // in-place repaints (paintDetail itself, grading, flipping) must not.
  assert.ok(
    src.includes("  paintDetail();\n  topOfView();"),
    "renderSetDetail must reset after paintDetail, not inside it"
  );
});

test("in-place repaints never reset scroll", () => {
  // No topOfView call may appear inside paintDetail / paintReviewCard /
  // revealCard / answerQuiz / paintQuizQ bodies — approximated by asserting
  // the total call-site count matches exactly the nine renderers.
  const callSites = src.split("topOfView();").length - 1;
  assert.equal(callSites, 9, "exactly the nine view renderers reset scroll");
});

console.log("quiz length picker wiring (item 1)");

test("panel uses the extracted quizLengths helper", () => {
  assert.ok(src.includes('from "./quiz-lengths.js"'));
  assert.ok(src.includes("quizLengths(s.total, available)"));
  assert.ok(!src.includes("[0.1, \"Quick\"]"), "old percentage rule is gone");
});

console.log("review button + study ahead (item 5)");

test("footer CTA renders for any set with cards, not only due ones", () => {
  assert.ok(src.includes('tab === "cards" && s.total'));
  assert.ok(!src.includes('tab === "cards" && s.due\n'));
  assert.ok(src.includes("Study ahead"));
});

test("startSetReview falls back to not-yet-due cards", () => {
  assert.ok(src.includes("const pool = due.length ? due : set?.flashcards || [];"));
  assert.ok(!src.includes('"Nothing due in this set."'));
});

console.log("regenerate affordance (item 1a)");

test("regenerate button exists on an existing set and warns first", () => {
  assert.ok(src.includes('data-action="make-set"'), "make-set action present");
  assert.ok(src.includes("Regenerate"), "labeled Regenerate");
  assert.ok(src.includes("confirm("), "asks before replacing");
});

test("SM-2 schedules survive a regenerate (service worker)", () => {
  const sw = readFileSync(new URL("../src/background/service-worker.js", import.meta.url), "utf8");
  assert.ok(sw.includes("byFront"), "matches regenerated cards by front");
  assert.ok(sw.includes("dueDate: old.dueDate"), "carries the schedule over");
  assert.ok(sw.includes("examDate: existing?.examDate ?? null"), "exam date preserved");
  assert.ok(sw.includes("summary: existing?.summary"), "summary preserved");
});

console.log(`\n${passed} tests passed`);
