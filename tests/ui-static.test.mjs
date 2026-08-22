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
  assert.ok(callSites >= 11, `expected >=11 call sites, found ${callSites}`);
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
  // the total call-site count matches exactly the view renderers' exits:
  // home, exam picker, sets, set detail, make-set, import, teams (two exits:
  // signed-out early return + normal path), team detail, you, auth gate.
  const callSites = src.split("topOfView();").length - 1;
  assert.equal(callSites, 11, "exactly the view-renderer exits reset scroll");
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


console.log("coding practice decoupling (standalone session)");

const codingStart = src.indexOf("// --- Coding practice: a standalone session started from the set");
const codingEnd = src.indexOf("// --- Typed-answer practice over a set's cards");
const codingBlock = src.slice(codingStart, codingEnd);

test("the coding block never touches the review queue", () => {
  assert.ok(codingStart !== -1 && codingEnd !== -1, "coding block found");
  for (const banned of ["queue[qIdx]", "queue.length", "qIdx++", "paintReviewCard"]) {
    assert.ok(!codingBlock.includes(banned), `coding block must not contain ${banned}`);
  }
});

test("session shape mirrors typed practice (5 items, focusReturn, showChrome)", () => {
  assert.ok(codingBlock.includes("startCodingPractice(sessionId)"));
  assert.ok(codingBlock.includes("slice(0, 5)"), "coding sessions are 5 exercises");
  assert.ok(codingBlock.includes('focusReturn = "set:" + sessionId'));
  assert.ok(codingBlock.includes("showChrome(false)"));
  assert.ok(codingBlock.includes("paintCodingQ();"));
});

test("progress chrome counts the session, not the queue", () => {
  const bars = codingBlock.match(/\$\{idx \+ 1\} \/ \$\{items\.length\}/g) || [];
  assert.ok(bars.length >= 2, "editor + spinner screens use idx / items.length");
  assert.ok(codingBlock.includes("(idx / items.length) * 100"));
});

test("code-next advances codingState, never qIdx", () => {
  assert.ok(src.includes('case "code-next": codingState.idx++; paintCodingQ(); break;'));
  assert.ok(!src.includes('case "code-next": qIdx++'));
});

test("a slow LLM response cannot paint over a left/restarted session", () => {
  assert.ok(codingBlock.includes("codingState.token !== token"), "stale-response token guard");
  assert.ok(src.includes("function goReturn() {\n  codingState = null;"), "leaving the focus view ends the sitting");
});

test("the review flow shows Apply unconditionally again", () => {
  assert.ok(src.includes('data-action="apply-card"'));
  assert.ok(!src.includes('queue[qIdx].mode === "coding"'));
  assert.ok(!src.includes('data-action="code-card"'));
});

test("the mode selector is present on the summary tab; the entry point is the set page button", () => {
  assert.ok(src.includes('data-action="set-mode"'));
  assert.ok(src.includes("modebtn"));
  assert.ok(src.includes('data-action="start-coding"'));
  assert.ok(src.includes("⌨️ Coding exercises") || src.includes("?? Coding exercises"));
  // full-width (btn-block) and above the ＋ Card / ✍️ row in source order
  const btnAt = src.indexOf('data-action="start-coding"');
  const typeAt = src.indexOf('data-action="start-typed"');
  assert.ok(btnAt < typeAt, "Coding exercises sits above the two-button row");
});

test("review queue items no longer carry a mode field", () => {
  assert.ok(!src.includes("mode: set.mode"));
  assert.ok(!src.includes("mode: set?.mode"));
});


console.log('share-a-set wiring');

test('set detail header hosts the share block with copy + revoke (not buried in a tab)', () => {
  assert.ok(src.includes('data-action="set-share"'), 'header Share link button present');
  assert.ok(src.includes('id="shareOut"'), 'reveal container on every tab');
  assert.ok(src.includes('data-action="share-copy"'));
  assert.ok(src.includes('data-action="share-revoke"'));
  assert.ok(src.includes('SHARE_CREATE'), 'share codes created through the service worker');
});

test('receiving side: lookup, duplicate guard, preview, import', () => {
  assert.ok(src.includes('function renderTeams()'));
  assert.ok(!src.includes('function renderShared()'), 'old Shared renderer is gone');
  assert.ok(src.includes('s.shareCode === code'), 're-entering a used code is blocked');
  assert.ok(src.includes('data-action="share-import"'));
});

test('import builds fresh ids and fresh schedules, no sender fields', () => {
  const fn = src.slice(src.indexOf("async function importSharedSet"), src.indexOf("async function authSubmit"));
  assert.ok(fn.length > 200, 'import function located');
  assert.ok(fn.includes('...initSchedule(now)'), 'cards start from scratch');
  assert.ok(fn.includes('id: uid()'), 'new ids');
  for (const leak of ['examDate', 'summary', 'blurb', 'easiness']) {
    assert.ok(!fn.includes(leak), 'import must not carry ' + leak);
  }
});

test('share/team copy fields escape every interpolated value', () => {
  assert.ok(src.includes('value="${esc(value)}"'));
  assert.ok(src.includes('data-code="${esc(value)}"'));
});

test('nav reads Teams; service worker routes the share + team messages', () => {
  const html = readFileSync(new URL("../src/ui/panel.html", import.meta.url), "utf8");
  assert.ok(html.includes("Teams") && !html.includes("Shared"));
  const sw = readFileSync(new URL("../src/background/service-worker.js", import.meta.url), "utf8");
  for (const m of ["SHARE_CREATE", "SHARE_FETCH", "SHARE_REVOKE", "TEAM_CREATE", "TEAM_JOIN", "TEAM_LIST", "TEAM_GET", "TEAM_LEAVE"]) {
    assert.ok(sw.includes('case "' + m + '"'), m + " routed");
  }
});

console.log('teams wiring');

test('teams home: Create a team pinned bottom-right, Join below it with the exact placeholder', () => {
  assert.ok(src.includes('class="team-actions"'), 'fixed create/join stack');
  assert.ok(src.includes('data-action="team-create">Create a team</button>'), 'primary Create button');
  const createAt = src.indexOf('data-action="team-create"');
  const joinAt = src.indexOf('placeholder="Enter team code"');
  assert.ok(createAt !== -1 && joinAt !== -1 && createAt < joinAt, 'Join (with placeholder) sits directly below Create');
  assert.ok(src.includes("Sign in to create a team"), 'signed-out state explains the account requirement');
});

test('team detail: copyable link + code, leaderboard, who is learning what, leave', () => {
  assert.ok(src.includes('function renderTeam(id)'));
  assert.ok(src.includes('teamLinkFor(team.code, LANDING_BASE)'), 'team link built from LANDING_BASE');
  assert.ok(src.includes('Leaderboard'));
  assert.ok(src.includes("Who's learning what"));
  assert.ok(src.includes('data-action="team-leave"'));
  assert.ok(src.includes('data-action="open-team"'));
});

test('share link helpers come from the pure module', () => {
  assert.ok(src.includes('from "./share-link.js"'));
  assert.ok(src.includes('shareLinkFor(code, LANDING_BASE)'));
  assert.ok(src.includes('parseShareCode('));
  assert.ok(src.includes('parseTeamCode('));
});

console.log(`\n${passed} tests passed`);
