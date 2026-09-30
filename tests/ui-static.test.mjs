// Static guards for panel behaviors that need a real browser to *see*, but
// whose wiring can be asserted from source. Complements the hand-check.
// Run: node tests/ui-static.test.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AI_CHAT_HOSTS } from "../src/ui/ai-hosts.js";

import fs, { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const uiDir = join(__dirname, "../src/ui");
function getAllJs(dir) {
  let files = [];
  for (const file of readdirSync(dir)) {
    const p = join(dir, file);
    if (statSync(p).isDirectory()) files.push(...getAllJs(p));
    else if (p.endsWith(".js")) files.push(p);
  }
  return files;
}
const src = getAllJs(uiDir).map(f => readFileSync(f, "utf8").replace(/\r\n/g, "\n")).join("\n");
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
  // signed-out early return + normal path), team detail, you, auth gate,
  // delete account, and the chain step editor.
  // Redesign: + Home's empty/first-sync exit, + Discover (signed-out exit),
  // + Stats; the old exam picker screen is gone (the exam edits in place).
  const callSites = src.split("topOfView();").length - 1;
  assert.equal(callSites, 16, "exactly the view-renderer exits reset scroll");
});

console.log("regenerate affordance (item 1a)");

test("regenerate button exists on an existing set and warns first", () => {
  assert.ok(src.includes('data-action="make-set"'), "make-set action present");
  assert.ok(src.includes("Regenerate"), "labeled Regenerate");
  assert.ok(src.includes("confirm(") || src.includes("confirmSheet("), "asks before replacing");
});

test("SM-2 schedules survive a regenerate (service worker)", () => {
  const sw = readFileSync(new URL("../src/background/service-worker.js", import.meta.url), "utf8");
  assert.ok(sw.includes("byFront"), "matches regenerated cards by front");
  assert.ok(sw.includes("dueDate: old.dueDate"), "carries the schedule over");
  assert.ok(sw.includes("examDate: existing?.examDate ?? null"), "exam date preserved");
  assert.ok(sw.includes("summary: existing?.summary"), "summary preserved");
});


console.log("coding practice decoupling (standalone session)");

let codingBlock = readFileSync(join(__dirname, "../src/ui/flows/coding.js"), "utf8");
const codingStart = 0;
const codingEnd = codingBlock.length;

test("the coding block never touches the review queue", () => {
  assert.ok(codingStart !== -1 && codingEnd !== -1, "coding block found");
  for (const banned of ["queue[qIdx]", "queue.length", "qIdx++", "paintReviewCard"]) {
    assert.ok(!codingBlock.includes(banned), `coding block must not contain ${banned}`);
  }
});

test("session shape mirrors typed practice (5 items, focusReturn, showChrome)", () => {
  assert.ok(codingBlock.includes("startCodingPractice(sessionId)"));
  assert.ok(codingBlock.includes("slice(0, 5)"), "coding sessions are 5 exercises");
  assert.ok(codingBlock.includes('setFocusReturn("set:" + sessionId)'));
  assert.ok(codingBlock.includes("showChrome(false)"));
  assert.ok(codingBlock.includes("paintCodingQ();"));
});

test("progress chrome counts the session, not the queue", () => {
  const bars = codingBlock.match(/\$\{idx \+ 1\} \/ \$\{items\.length\}/g) || [];
  assert.ok(bars.length >= 2, "editor + spinner screens use idx / items.length");
  assert.ok(codingBlock.includes("(idx / items.length) * 100"));
});

test("code-next advances codingState, never qIdx", () => {
  assert.ok(src.includes('case "code-next": codingNext(); break;'));
  assert.ok(!src.includes('case "code-next": qIdx++'));
});

test("a slow LLM response cannot paint over a left/restarted session", () => {
  assert.ok(codingBlock.includes("codingState.token !== token"), "stale-response token guard");
  assert.ok(src.includes("function goReturn() {\n  setCodingState(null);"), "leaving the focus view ends the sitting");
});

test("the review flow shows Apply unconditionally again", () => {
  assert.ok(src.includes('data-action="apply-card"'));
  assert.ok(!src.includes('queue[qIdx].mode === "coding"'));
  assert.ok(!src.includes('data-action="code-card"'));
});

test("the mode selector is present on the summary tab; the entry point is the set page button", () => {
  assert.ok(src.includes('data-action="set-mode"') || src.includes('dataset.action = "set-mode"'));
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



const readSrc = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const walkJs = (dir) =>
  fs.readdirSync(new URL(dir, import.meta.url), { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walkJs(dir + d.name + "/") : d.name.endsWith(".js") ? [dir + d.name] : []
  );

console.log("System design + Medicine wiring (prompts 11-15)");

test("every data-action the panel renders has a handler", () => {
  const panel = readSrc("../src/ui/panel.js");
  const actions = new Set();
  for (const f of walkJs("../src/ui/")) {
    for (const m of readSrc(f).matchAll(/data-action="([a-z0-9-]+)"/g)) actions.add(m[1]);
  }
  // Either a case in the main switch, or the second listener's dataset.action === check.
  const handled = (a) => panel.includes('case "' + a + '"') || panel.includes('=== "' + a + '"');
  const missing = [...actions].filter((a) => !handled(a));
  assert.deepEqual(missing, [], "buttons without a handler do nothing when tapped");
});

test("every message the panel sends is routed by the worker", () => {
  const sw = readSrc("../src/background/service-worker.js");
  const types = new Set();
  for (const f of walkJs("../src/ui/")) {
    // Only messages to the worker (send); sendToTab talks to content scripts.
    for (const m of readSrc(f).matchAll(/\bsend\(\{\s*type: "([A-Z_]+)"/g)) types.add(m[1]);
  }
  const missing = [...types].filter((t) => !sw.includes('case "' + t + '"'));
  assert.deepEqual(missing, [], "unrouted messages fail with 'Unknown message type'");
});

test("every CSS variable the UI uses is defined", () => {
  const css = readSrc("../src/ui/panel.css");
  const defined = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  const used = new Set();
  for (const f of [...walkJs("../src/ui/"), "../src/ui/panel.css"]) {
    for (const m of readSrc(f).matchAll(/var\((--[a-z0-9-]+)/g)) used.add(m[1]);
  }
  const undefinedVars = [...used].filter((v) => !defined.has(v));
  assert.deepEqual(undefinedVars, [], "an undefined variable silently renders nothing");
});

test("drill review-log rows never carry an empty card id (it fails server validation for the whole sync)", () => {
  for (const f of walkJs("../src/ui/")) {
    assert.ok(!/cardId:\s*""/.test(readSrc(f)), f + " logs an empty cardId");
  }
  for (const f of ["design", "estimation", "bottleneck"]) {
    const flow = readSrc("../src/ui/flows/" + f + ".js");
    assert.ok(flow.includes("drillLogEntry("), f + " logs through drillLogEntry");
    assert.ok(!flow.includes('kind: "teach"'), f + " must log its own kind");
  }
});

test("System design sets show all three drills", () => {
  const detail = readSrc("../src/ui/views/set-detail.js");
  for (const a of ["start-design", "start-estimation", "start-bottleneck"]) {
    assert.ok(detail.includes('data-action="' + a + '"'), "set detail needs " + a);
  }
  assert.ok(detail.includes('["design", "System design"'), "the mode picker offers System design");
  assert.ok(detail.includes('["medicine", "Medicine"'), "the mode picker offers Medicine");
});

test("leaving a drill drops its state", () => {
  const review = readSrc("../src/ui/flows/review.js");
  for (const fn of ["setDesignState(null)", "setEstimationState(null)", "setBottleneckState(null)", "setTeachState(null)", "setCompareState(null)"]) {
    assert.ok(review.includes(fn), "goReturn must call " + fn);
  }
});

test("regenerating sends the set's mode, so design and medicine sets get their style", () => {
  const sw = readSrc("../src/background/service-worker.js");
  assert.ok(sw.includes("generateForSession(session, existingSet?.mode)"));
  assert.ok(readSrc("../src/sync/api.js").includes('post("/v1/generate", { messages, title, mode })'));
});

test("the Chains tab shows gaps honestly and says it isn't medical advice", () => {
  const detail = readSrc("../src/ui/views/set-detail.js");
  assert.ok(detail.includes('tab === "chains"'), "the Chains tab has a body");
  assert.ok(detail.includes("Not in your source"), "gaps are labelled, never filled");
  assert.ok(detail.includes("Not medical advice"), "framing line");
  assert.ok(!/<ol[^>]*>[^]*?<div class="chain-arrow"/.test(detail), "arrows are list items, not divs inside <ol>");
});

test("the persona chip is quiet: the right emoji, not a button, styled in CSS", () => {
  const teach = readSrc("../src/storage/teach.js");
  assert.ok(teach.includes('emoji: "🧒"') && teach.includes('emoji: "🙋"'));
  const flow = readSrc("../src/ui/flows/teach.js");
  assert.ok(flow.includes('class="teach-persona-chip tag" role="note"'));
  assert.ok(!/teach-persona-chip[^>]*style=/.test(flow), "styling lives in panel.css");
  assert.ok(readSrc("../src/ui/panel.css").includes(".teach-persona-chip"));
});

test("the medicine suggestion reads the same field the worker saves", () => {
  const detail = readSrc("../src/ui/views/set-detail.js");
  const sw = readSrc("../src/background/service-worker.js");
  assert.ok(sw.includes("suggestMedicine:"), "the worker stores suggestMedicine");
  assert.ok(detail.includes("studySet.suggestMedicine &&"), "the banner must read suggestMedicine");
  assert.ok(!detail.includes("suggestMedicineMode"), "no field that nothing sets");
});

test("every review-log row has a grade (a row without one fails the whole sync batch)", () => {
  for (const f of walkJs("../src/ui/")) {
    const src = readSrc(f);
    for (const m of src.matchAll(/appendReviewLog\(\{[\s\S]*?\}\)/g)) {
      // Either `grade: g` or the shorthand `grade,`.
      assert.ok(/\bgrade\s*[,:]/.test(m[0]), f + " logs a review row without a grade");
    }
  }
});

test("Medicine practice drills log their own kind through drillLogEntry", () => {
  const drill = readSrc("../src/ui/flows/chain-drill.js");
  assert.ok(drill.includes("drillLogEntry("), "chain drills log through the shared helper");
  assert.ok(!/appendReviewLog\(\{/.test(drill), "no hand-rolled row without a grade");
  const kinds = readSrc("../src/storage/drill-log.js");
  for (const k of ["chain-drill", "clinical"]) assert.ok(kinds.includes('"' + k + '"'), k + " must be a known drill kind");
});

test("link cards can't be edited from the card list: the chain owns them", () => {
  const detail = readSrc("../src/ui/views/set-detail.js");
  assert.ok(detail.includes("isLinkCard(c)"), "the card list knows which cards come from a chain");
  assert.ok(!detail.includes("chainlink:"), "ids come from linkId(), never hand-built");
});

test("every btn-* class the UI uses is styled", () => {
  const css = readSrc("../src/ui/panel.css");
  const defined = new Set([...css.matchAll(/\.(btn-[a-z0-9-]+)/g)].map((m) => m[1]));
  const used = new Set();
  for (const f of walkJs("../src/ui/")) {
    for (const m of readSrc(f).matchAll(/class="[^"]*\b(btn-[a-z0-9-]+)/g)) used.add(m[1]);
  }
  assert.deepEqual([...used].filter((c) => !defined.has(c)), [], "an unstyled button variant renders plain");
});

test("Compare conditions is wired end to end and offered only when there are two chains", () => {
  const detail = readSrc("../src/ui/views/set-detail.js");
  assert.ok(detail.includes('data-action="start-compare"'), "set detail needs the Compare entry point");
  assert.ok(detail.includes("liveChains(studySet.chains).length >= 2"), "a tombstoned chain must not count towards the two");
  const panel = readSrc("../src/ui/panel.js");
  for (const action of ["start-compare", "compare-select", "compare-toggle", "compare-fork-cards"]) {
    assert.ok(panel.includes('case "' + action + '"'), "panel must route " + action);
  }
  const flow = readSrc("../src/ui/flows/compare.js");
  assert.ok(flow.includes("storage/compare.js"), "the judgement lives in the pure module");
  assert.ok(
    /await (saveStudySet|updateStudySet)\(/.test(flow),
    "an override that is not written through store.js is not an override"
  );
});

test("fork cards are ordinary review cards: scheduled, stamped, and never duplicated", () => {
  const src = readSrc("../src/storage/compare.js");
  assert.ok(src.includes("dueDate"), "a card with no dueDate is never scheduled like the rest");
  assert.ok(src.includes("updatedAt"), "an unstamped card never syncs");
  assert.ok(src.includes("cards.find((c) => c.id === id)"), "ids are derived, so making cards twice is a no-op");
});

test("the worried patient is a Medicine-only persona, decided by one rule", () => {
  const flow = readSrc("../src/ui/flows/teach.js");
  assert.ok(flow.includes("personaOptions(teachState.isMedicine)"), "the option list comes from the rule");
  assert.ok(flow.includes("pickPersona(persona, teachState.isMedicine)"), "the click handler applies the same rule");
  assert.ok(flow.includes('isMedicine: (set?.mode || "") === "medicine"'), "startTeach must set isMedicine from the set mode");
});

test("no request in the auth client can hang: they all go through timedFetch", () => {
  const src = readSrc("../src/sync/auth.js");
  // timedFetch itself is the one place that may call fetch directly.
  const rest = src.slice(src.indexOf("export function getAuth"));
  for (const call of ["await fetch(", "= fetch(", "return fetch("]) {
    assert.ok(!rest.includes(call), "a bare fetch() in the auth client has no ceiling and can hang the panel");
  }
});

test("signing in never waits on a sync, and a failed sync says so", () => {
  const you = readSrc("../src/ui/views/you.js");
  assert.ok(!you.includes("await syncNow()"), "awaiting the first sync is what left the button on 'Waiting for Google…'");
  assert.ok(you.includes("syncNow().catch("), "a sync that fails must still surface");
});

test("clicking sign in always signs in, even with an abandoned attempt running", () => {
  const you = readSrc("../src/ui/views/you.js");
  const fn = you.slice(you.indexOf("export async function authGoogle"), you.indexOf("export async function afterSignIn"));
  assert.ok(fn.includes("googleAbortController.abort()"), "the stale attempt is ended");
  assert.ok(!fn.includes("renderHome"), "a click on Sign in must not navigate away instead of signing in");
});

test("no file outside store.js reads or writes the study data keys directly", () => {
  for (const dir of ["../src/ui/", "../src/background/", "../src/sync/"]) {
    for (const f of walkJs(dir)) {
      const src = readSrc(f);
      for (const k of ["sessions", "studySets", "activity", "reviewLog", "lastSync"]) {
        assert.ok(!src.includes('"' + k + '"') && !src.includes("'" + k + "'") && !src.includes("\`" + k + "\`"), f + " bypasses store.js for " + k);
      }
    }
  }
});

test("every drill screen opens with a header, and the chain drill has a way out", () => {
  // A focus view that starts with bare content sits flush against the browser's
  // own side-panel bar, which reads as a seam; and a drill with no close button
  // stranded the learner in it.
  for (const flow of ["chain-drill", "compare", "design", "estimation", "bottleneck"]) {
    const src = readSrc("../src/ui/flows/" + flow + ".js");
    for (const m of src.matchAll(/setHTML\(app, `/g)) {
      const head = src.slice(m.index, m.index + 160);
      assert.ok(/rev-top|ahd|progressBar\(\)/.test(head), flow + ".js paints a view with no header");
    }
  }
  const drill = readSrc("../src/ui/flows/chain-drill.js");
  assert.ok(drill.includes("return-focus"), "the chain drill needs the same close button as every other drill");
});

test("YouTube and PDF capture: permission first, and no dead caption endpoint", () => {
  const read = (p) => fs.readFileSync(join(__dirname, p), "utf8").replace(/\r\n/g, "\n");

  const cap = read("../src/ui/capture.js");
  const fn = cap.slice(cap.indexOf("export async function captureCurrent"));
  const body = fn.slice(0, fn.indexOf("\n}\n") + 2);
  assert.ok(body.includes("chrome.permissions.request"), "captureCurrent must ask for site access");
  assert.ok(
    body.indexOf("chrome.permissions.request") < body.indexOf("queryActiveTab"),
    "request the permission before anything is awaited, or the click's user gesture is lost"
  );

  const sw = read("../src/background/service-worker.js");
  assert.ok(sw.includes("function extractYouTubeTranscript"), "the transcript extractor must exist");
  assert.ok(sw.includes("classifyUrl("), "captureTabAndSave must route by URL kind");
  // Caption URLs we build ourselves (captionTracks[].baseUrl) come back empty
  // without the player's proof-of-origin token, and the transcript panel was
  // found failing live (its get_transcript call is refused). The only caption
  // source that works is the request the player makes, so the extractor may
  // watch /api/timedtext but never fetch a caption URL of its own.
  const swCode = sw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  assert.ok(!/captionTracks|baseUrl/.test(swCode), "never build a caption URL from captionTracks: it has no proof-of-origin token");
  assert.ok(!/fetch\(\s*[`'"][^`'"]*timedtext/.test(swCode), "never fetch timedtext directly; watch the player's own request");
  const yt = swCode.slice(swCode.indexOf("async function extractYouTubeTranscript"));
  assert.ok(/includes\("\/api\/timedtext"\)/.test(yt), "the extractor recognises the player's caption request");

  const capFile = read("../src/ui/capture.js");
  const panelHtml = read("../src/ui/panel.html");
  assert.ok(panelHtml.includes('id="captureCurrentBtn"') && capFile.includes("refreshCaptureDock"), "the capture button must carry kind/origin");

  assert.ok(
    /"content-type": "application\/json",\s*\.\.\.\(opts\.headers \|\| \{\}\)/.test(read("../src/sync/auth.js")),
    "authedFetch must let a caller override content-type (the PDF upload sends raw bytes)"
  );
});


test("open in tab rules", () => {
  const read = (p) => fs.readFileSync(join(__dirname, p), "utf8").replace(/\r\n/g, "\n");

  const core = read("../src/ui/core.js");
  assert.ok(core.includes("getLastContentTabId()"), "queryActiveTab must fall back to the last content tab if Mafsar itself is active");
  assert.ok(core.includes("!isMafsarUrl(current?.url)"), "queryActiveTab must skip the Mafsar tab");

  const sw = read("../src/background/service-worker.js");
  assert.ok(sw.includes('case "SET_OPEN_IN_TAB":'), "service-worker must listen for SET_OPEN_IN_TAB to flip the panel behaviour");
  assert.ok(sw.includes("rememberOpenInTab(msg.value)"), "SET_OPEN_IN_TAB must go through rememberOpenInTab");
  assert.ok(sw.includes("openPanelOnActionClick: !openInTab"), "rememberOpenInTab must flip openPanelOnActionClick");
  assert.ok(sw.includes("chrome.tabs.update") && sw.includes("chrome.windows.update"), "onClicked must focus an existing tab, not open five");
  assert.ok(sw.includes("chrome.tabs.create"), "onClicked must create the tab if none exists");
  // The click handler must NOT read storage: after that await, Firefox refuses
  // sidebarAction.toggle() and the icon does nothing. tests/toolbar-click.test.mjs
  // fires the real listener; this just keeps the obvious regression out.
  const click = sw.slice(sw.indexOf("chrome.action.onClicked.addListener"));
  const handler = click.slice(0, click.indexOf("\n  });"));
  assert.ok(!/async\s*\(tab\)/.test(handler), "the toolbar click handler must not be async");
  assert.ok(!handler.includes("await"), "nothing may be awaited before the sidebar opens");

  const you = read("../src/ui/views/you.js");
  assert.ok(you.includes('id="openInTabCheck"'), "You view must have the checkbox");

  const panel = read("../src/ui/panel.js");
  assert.ok(panel.includes('id === "openInTabCheck"'), "panel.js must wire the checkbox");
  assert.ok(panel.includes("saveSettings({ openInTab"), "panel.js must persist the preference");
});

console.log(`\n${passed} tests passed`);




console.log("Inline edit (prompt 06)");
test("Inline edit replaces separate blocks", () => {
  const detail = fs.readFileSync(new URL("../src/ui/views/set-detail.js", import.meta.url), "utf8");
  assert.ok(!detail.includes("function paintAddCard()"), "paintAddCard must be deleted");
  assert.ok(detail.includes('card-wrapper editing'), "the editor renders inside the row container");
  assert.ok(detail.includes('if (updateInPlace && !force && (editingCardId || detail?.addingCard)) return;'), "a sync landing mid-edit must not repaint");
  
  const bindEvents = detail.slice(detail.indexOf("function bindEditorEvents"));
  assert.ok(bindEvents.includes("Both fields are required"), "hint shows when empty");
  assert.ok(bindEvents.includes("Too long: "), "hint shows when too long");
  assert.ok(bindEvents.includes("disabled = true"), "Done is disabled for empty or too long");
  
  const saveFn = detail.slice(detail.indexOf("function saveCardEdit"));
  assert.ok(saveFn.includes("if (card.front === front && card.back === back)"), "unchanged text writes nothing");
  assert.ok(saveFn.includes("ratio > 0.5"), "reset threshold must be 50%");
  // toast() escapes its text, so an HTML entity would show literally: the
  // separator is the character itself.
  assert.ok(saveFn.includes("toast(\"Card saved · Reset progress?\""), "Reset toast triggers");
  assert.ok(saveFn.includes("initSchedule()"), "Reset calls initSchedule");
  
  const panel = fs.readFileSync(new URL("../src/ui/panel.js", import.meta.url), "utf8");
  assert.ok(panel.includes("Discard your edit?"), "tapping nav with unsaved changes asks to discard");
});

console.log("Restyle remaining (prompt 13)");
test("no old variable name is used outside 00 alias block", () => {
  const css = fs.readFileSync(new URL("../src/ui/panel.css", import.meta.url), "utf8");
  const withoutAliases = css.split("/* 00 ALIASES START */")[0] + (css.split("/* 00 ALIASES END */")[1] || "");
  const oldVars = ["--primary", "--primary-strong", "--primary-soft", "--warm", "--warm-soft", "--success", "--success-soft", "--danger", "--danger-soft", "--ink", "--muted", "--faint", "--bg", "--surface", "--surface-2", "--border"];
  for (const v of oldVars) {
    if (v === "--primary") {
      // primary is part of --text-primary etc., so exact match check
      assert.ok(!new RegExp(`var\\(\\s*${v}\\s*\\)`).test(withoutAliases), `old variable ${v} must not be used outside alias block`);
    } else {
      assert.ok(!withoutAliases.includes(`var(${v})`), `old variable ${v} must not be used outside alias block`);
    }
  }
});

test("every view renders with no hex colour in inline styles", () => {
  for (const f of walkJs("../src/ui/")) {
    if (f.endsWith("/icons.js")) continue;
    const content = fs.readFileSync(new URL(f, import.meta.url), "utf8");
    const matches = [...content.matchAll(/style="[^"]*#[0-9a-fA-F]{3,6}[^"]*"/g)];
    assert.deepStrictEqual(matches.map(m => m[0]), [], f + " must not contain hex colors in style strings");
  }
});

test("Teams is reachable from You; 'Your stats' opens Stats", () => {
  const you = fs.readFileSync(new URL("../src/ui/views/you.js", import.meta.url), "utf8");
  assert.ok(you.includes('data-action="nav-teams"'), "Teams must be reachable from You");
  assert.ok(you.includes('data-action="nav-stats"'), "Stats must be reachable from You");
  const panel = fs.readFileSync(new URL("../src/ui/panel.js", import.meta.url), "utf8");
  assert.ok(panel.includes('case "nav-teams"'), "panel handles nav-teams");
  assert.ok(panel.includes('case "nav-stats"'), "panel handles nav-stats");
});

test("Focus-view headers all have an End session button", () => {
  for (const f of walkJs("../src/ui/flows/")) {
    const content = fs.readFileSync(new URL(f, import.meta.url), "utf8");
    if (!content.includes('class="view"')) continue; // Some files might not render views
    assert.ok(content.includes('aria-label="End session"'), f + " must have an End session button");
  }
});


console.log("QA pass (prompt 04)");

test("Geist is bundled and no Google Fonts are fetched", () => {
  const html = readSrc("../src/ui/panel.html");
  assert.ok(!html.includes("fonts.googleapis.com"), "no google fonts");
  assert.ok(html.includes('vendor/geist/Geist'), "bundles Geist");
  
  const css = readSrc("../src/ui/panel.css");
  assert.ok(css.includes('font-display: block'), "no fallback flash");
});

test("No raw 'User hh:mm AM' text in source", () => {
  for (const f of getAllJs(uiDir)) {
    const s = fs.readFileSync(f, "utf8");
    assert.ok(!s.includes("User hh:mm"), "no raw time default");
  }
});

test("Nav has no raised play button", () => {
  const html = readSrc("../src/ui/panel.html");
  assert.ok(!html.includes('class="nav-main"'), "no raised play button");
  assert.ok(html.includes('data-nav="discover"'), "has Discover tab");
});

test("No 0% progress bars", () => {
  for (const f of getAllJs(uiDir)) {
    const s = fs.readFileSync(f, "utf8");
    assert.ok(!s.match(/width:\\$\\{(?!.*Math\\.max)[^}]+\\}/), "0% bars fixed");
  }
});

test("Fading soon clamps at 2 lines", () => {
  const css = readSrc("../src/ui/panel.css");
  assert.ok(css.includes('-webkit-line-clamp: 2'), "fading soon uses 2 lines");
});

test("Screen-reader labels", () => {
  const sd = readSrc("../src/ui/views/set-detail.js");
  assert.ok(sd.includes('aria-label="Back"'), "Back");
  assert.ok(sd.includes('aria-label="Share"'), "Share");
  assert.ok(sd.includes('aria-label="More"'), "More");
  assert.ok(sd.includes('aria-label="Study mode"'), "Study mode");
  assert.ok(sd.includes('aria-label="How it works"'), "How it works");
});

test("Ratings (prompt 07)", async () => {
  const detail = fs.readFileSync("src/ui/views/set-detail.js", "utf8");
  const ratings = fs.readFileSync("src/storage/ratings.js", "utf8");
  const setRow = fs.readFileSync("src/ui/set-row.js", "utf8");
  const sync = fs.readFileSync("src/sync/sync.js", "utf8");
  
  // store
  assert.ok(ratings.includes("pending"), "optimistic update state exists");
  // Behaviour is covered in tests/ratings.test.mjs (a failed write rolls back).
  assert.ok(ratings.includes("cache[rootId] = prev"), "rollback implemented");
  assert.ok(ratings.includes("flushPendingRatings"), "offline queue flush function exists");
  assert.ok(sync.includes("flushPendingRatings"), "syncNow calls flush");
  
  // radiogroup semantics
  assert.ok(detail.includes('role="radiogroup"'), "radiogroup used");
  assert.ok(detail.includes('aria-checked='), "aria-checked used");
  assert.ok(detail.includes('e.key === "Backspace" || e.key === "Delete"'), "keyboard clear");
  assert.ok(detail.includes('ArrowRight'), "keyboard nav");
  
  // formatting
  const format = fs.readFileSync("shared/format.js", "utf8");
  assert.ok(format.includes("toFixed(1)"), "average formatted with 1 decimal");
  
  // text states
  assert.ok(detail.includes("Your rating &bull;"), "private rated text");
  assert.ok(detail.includes("Tap to rate"), "private unrated text");
  assert.ok(detail.includes("No ratings yet"), "global unrated text");
  assert.ok(detail.includes("rating(s)"), "global rated text");
  
  // SetRow meta
  assert.ok(setRow.includes("yours"), "SetRow private suffix");
  assert.ok(setRow.includes("Global"), "SetRow global suffix");
});
