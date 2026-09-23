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
  // delete account, the chain step editor, and the account-switch choice.
  const callSites = src.split("topOfView();").length - 1;
  assert.equal(callSites, 15, "exactly the view-renderer exits reset scroll");
});

console.log("quiz length picker wiring (item 1)");

test("panel uses the extracted quizLengths helper", () => {
  assert.ok(src.includes("quiz-lengths.js"));
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
  const fn = fs.readFileSync(join(__dirname, "../src/ui/views/sets.js"), "utf8");
  assert.ok(fn.length > 200, 'import function located');
  assert.ok(fn.includes('...initSchedule(now)'), 'cards start from scratch');
  assert.ok(fn.includes('id: uid()') || fn.includes('id:uid()'), 'new ids');
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

test('teams home: Create a team in document flow, Join below it with the exact placeholder', () => {
  assert.ok(src.includes('class="team-actions"'), 'in-flow create/join block');
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
  assert.ok(src.includes("share-link.js"));
  assert.ok(src.includes('shareLinkFor(code, LANDING_BASE)'));
  assert.ok(src.includes('parseShareCode('));
  assert.ok(src.includes('parseTeamCode('));
});

console.log('recent fixes');

test('capture.css stacks action buttons vertically', () => {
  const css = fs.readFileSync(join(__dirname, "../src/content/capture.css"), "utf8");
  assert.ok(css.includes('flex-direction: column;'));
  assert.ok(css.includes('align-items: flex-end;'));
});

test('capture.js does not swallow generation failure reasons', () => {
  const cap = fs.readFileSync(join(__dirname, "../src/ui/capture.js"), "utf8");
  assert.ok(cap.includes('toast(r.reason || '));
});

test('panel.js sign out redirects to auth gate', () => {
  const pan = fs.readFileSync(join(__dirname, "../src/ui/panel.js"), "utf8");
  assert.ok(pan.includes('renderAuthGate()'));
  assert.ok(pan.includes('logout().then(() => {'));
  assert.ok(pan.includes('.catch((e) => toast(e.message))'));
});

test("you.js doesn't silently swallow all billing fetch errors", () => {
  const you = fs.readFileSync(join(__dirname, "../src/ui/views/you.js"), "utf8");
  assert.ok(you.includes('if (e.message) toast(e.message);'));
  assert.ok(!you.includes('if (e.message === "Session expired — signed out") toast(e.message);'));
});

test('apply.js prevents stale LLM responses', () => {
  const file = fs.readFileSync(join(__dirname, "../src/ui/flows/apply.js"), "utf8");
  assert.ok(file.includes('const token = Math.random();'));
  assert.ok(file.includes('if (!applyState || applyState.token !== token) return;'));
  assert.ok(file.includes('if (applyState?.hypothetical !== hypothetical) return;'));
});

test('typed.js prevents stale LLM responses', () => {
  const file = fs.readFileSync(join(__dirname, "../src/ui/flows/typed.js"), "utf8");
  assert.ok(file.includes('const token = Math.random();'));
  assert.ok(file.includes('if (!typedState || typedState.token !== token) return;'));
});

test('service-worker fallback to empty array on missing LLM structure', () => {
  const file = fs.readFileSync(join(__dirname, "../src/background/service-worker.js"), "utf8");
  assert.ok(file.includes('Array.isArray(q.options) ? q.options : []'));
});

test("capture.js does not read a bare r.title", () => {
  const file = fs.readFileSync(join(__dirname, "../src/ui/capture.js"), "utf8");
  assert.ok(!file.includes("r.title"));
});

test("sets.js renders id='captureAnswerBtn' unconditionally", () => {
  const file = fs.readFileSync(join(__dirname, "../src/ui/views/sets.js"), "utf8");
  assert.ok(file.includes('id="captureAnswerBtn"'));
  assert.ok(!file.includes('? `<button class="btn btn-ghost btn-block" id="captureAnswerBtn"'));
});

test("refreshCaptureAnswerButton uses Math.random() token guard", () => {
  const file = fs.readFileSync(join(__dirname, "../src/ui/views/sets.js"), "utf8");
  assert.ok(file.includes('const token = Math.random();'));
  assert.ok(file.includes('if (captureAnswerToken !== token) return;'));
});

test("panel.js calls onActiveTabChange exactly once", () => {
  const file = fs.readFileSync(join(__dirname, "../src/ui/panel.js"), "utf8");
  const matches = [...file.matchAll(/onActiveTabChange\(/g)];
  assert.equal(matches.length, 1);
});

test("service-worker.js contains no tabs.onActivated listener", () => {
  const file = fs.readFileSync(join(__dirname, "../src/background/service-worker.js"), "utf8");
  assert.ok(!file.includes("tabs.onActivated"));
});

test("manifest.json AI chat hosts are in AI_CHAT_HOSTS", () => {
  const manifest = JSON.parse(fs.readFileSync(join(__dirname, "../manifest.json"), "utf8"));
  for (const group of manifest.content_scripts || []) {
    for (const match of group.matches || []) {
      const url = new URL(match.replace("/*", "/"));
      const host = url.hostname;
      // Exclude non-chat hosts
      if (host === "quizlet.com") continue; // Quizlet import flow
      if (host === "mafsar-production.up.railway.app") continue; // Mafsar landing page
      
      const isCovered = AI_CHAT_HOSTS.some((h) => host === h || host.endsWith("." + h));
      assert.ok(isCovered, `Host ${host} from manifest is missing from AI_CHAT_HOSTS`);
    }
  }
});



test("AI Studio is registered in ai-hosts, manifest and content_scripts", () => {
  assert.ok(AI_CHAT_HOSTS.includes("aistudio.google.com"), "missing from ai-hosts.js");
  const manifest = JSON.parse(fs.readFileSync(join(__dirname, "../manifest.json"), "utf8"));
  assert.ok(manifest.host_permissions.includes("https://aistudio.google.com/*"), "missing from host_permissions");

  const group = manifest.content_scripts.find((g) => g.matches.includes("https://aistudio.google.com/*"));
  assert.ok(group, "missing from content_scripts");

  const js = group.js;
  const adapterIdx = js.indexOf("src/content/adapters/adapter.js");
  const aistudioIdx = js.indexOf("src/content/adapters/aistudio.js");
  const captureIdx = js.indexOf("src/content/capture.js");
  assert.ok(adapterIdx !== -1 && aistudioIdx !== -1 && captureIdx !== -1);
  assert.ok(adapterIdx < aistudioIdx, "aistudio.js must load after adapter.js");
  assert.ok(aistudioIdx < captureIdx, "aistudio.js must load before capture.js");
});

test("makersuite.google.com is never granted a host permission", () => {
  // It only 302-redirects to aistudio.google.com, so a permission for it would
  // widen the install warning for a page that never actually renders.
  const manifest = JSON.parse(fs.readFileSync(join(__dirname, "../manifest.json"), "utf8"));
  const all = [
    ...manifest.host_permissions,
    ...manifest.content_scripts.flatMap((g) => g.matches || []),
  ];
  assert.ok(!all.some((h) => h.includes("makersuite")), "makersuite must not be in the manifest");
});

test("a sticky toast is only used where a replacement is guaranteed", () => {
  const core = fs.readFileSync(join(__dirname, "../src/ui/core.js"), "utf8");
  assert.ok(core.includes("if (ms > 0)"), "toast must support a non-expiring message");

  const cap = fs.readFileSync(join(__dirname, "../src/ui/capture.js"), "utf8");
  assert.ok(cap.includes('toast("Capturing…", 0)'), "capture should hold its message");
  // Every sticky toast needs a finite one after it on every path.
  assert.ok(cap.includes("} catch (e) {"), "capture must catch and replace the sticky toast");
});

test("capture repaints the current view instead of jumping to Home", () => {
  const cap = fs.readFileSync(join(__dirname, "../src/ui/capture.js"), "utf8");
  assert.ok(!cap.includes("renderHome()"), "capture must not navigate to Home");
  assert.ok(cap.includes("await goToActiveTab()"), "capture must await the repaint");
  assert.ok(!cap.includes("views/home.js"), "the home import should be gone");

  const nav = fs.readFileSync(join(__dirname, "../src/ui/nav.js"), "utf8");
  assert.ok(
    nav.includes("return (registry[activeTab] || registry.home)()"),
    "goToActiveTab must return the renderer promise so callers can await it"
  );
});

// A render function that awaits the network before its first setHTML leaves the
// panel showing the *previous* tab until the response lands. That is the
// "switching tabs is slow" bug; these guards keep the ordering correct.
function bodyOf(src, name) {
  const start = src.indexOf(`export async function ${name}(`);
  assert.ok(start > -1, `${name} not found`);
  const next = src.indexOf("\nexport ", start + 1);
  return src.slice(start, next === -1 ? src.length : next);
}

test("views paint from local data before any network call", () => {
  const cases = [
    ["../src/ui/views/you.js", "renderYou", ["authedFetch("]],
    ["../src/ui/views/teams.js", "renderTeams", ["TEAM_LIST"]],
    ["../src/ui/views/sets.js", "renderSets", ["isAIChatTab("]],
  ];
  for (const [file, fn, forbidden] of cases) {
    const body = bodyOf(fs.readFileSync(join(__dirname, file), "utf8"), fn);
    const paintAt = body.indexOf("setHTML(app");
    assert.ok(paintAt > -1, `${fn} must paint with setHTML(app, …)`);
    for (const needle of forbidden) {
      const at = body.indexOf(needle);
      assert.ok(
        at === -1 || at > paintAt,
        `${fn} awaits ${needle} before painting — the panel stays on the previous tab until it resolves`
      );
    }
  }
});

test("each async slot is filled after the paint and is layout-neutral", () => {
  const css = fs.readFileSync(join(__dirname, "../src/ui/panel.css"), "utf8");
  for (const id of ["#billingSlot", "#backupSlot", "#teamsSlot"]) {
    assert.ok(css.includes(id), `${id} needs a display:contents rule or it adds a 14px flex gap`);
  }
  assert.ok(css.includes("display: contents"), "slots must not produce a box while empty");

  const you = fs.readFileSync(join(__dirname, "../src/ui/views/you.js"), "utf8");
  assert.ok(you.includes("refreshBilling()"), "You must fill its slot after painting");
  assert.ok(you.includes("billingToken"), "a stale /v1/me response must not paint into another view");

  const teams = fs.readFileSync(join(__dirname, "../src/ui/views/teams.js"), "utf8");
  assert.ok(teams.includes("refreshTeamList()"), "Teams must fill its slot after painting");
  assert.ok(teams.includes("teamListToken"), "a stale TEAM_LIST response must not paint into another view");

  const sets = fs.readFileSync(join(__dirname, "../src/ui/views/sets.js"), "utf8");
  assert.ok(
    sets.includes("refreshCaptureAnswerButton().catch"),
    "renderSets must reuse the existing post-paint refresher"
  );
});

test("every slot refresher re-checks the slot after awaiting", () => {
  const fns = [
    ["../src/ui/views/you.js", "refreshBilling"],
    ["../src/ui/views/teams.js", "refreshTeamList"],
  ];
  for (const [file, fn] of fns) {
    const body = bodyOf(fs.readFileSync(join(__dirname, file), "utf8"), fn);
    assert.ok(
      /getElementById\((["'])\w+\1\)/.test(body),
      `${fn} must look the slot up after awaiting — the view may be gone`
    );
    assert.ok(body.includes("if (!"), `${fn} must bail when the slot is missing`);
  }
});

test("bundle() does one multi-key read, not six", () => {
  const core = fs.readFileSync(join(__dirname, "../src/ui/core.js"), "utf8");
  const start = core.indexOf("export async function bundle()");
  assert.ok(start > -1, "bundle() not found");
  const body = core.slice(start, core.indexOf("\n}", start));
  assert.ok(body.includes("readRaw(BUNDLE_KEYS)"), "must use a single multi-key read");
  for (const banned of ["getSessions()", "getStudySets()", "getReviewLog()", "getActivity()"]) {
    assert.ok(!body.includes(banned), `bundle() must not call ${banned} — each is its own IPC`);
  }
});

test("the in-flight coalescer is not a cache", () => {
  const core = fs.readFileSync(join(__dirname, "../src/ui/core.js"), "utf8");
  assert.ok(core.includes("bundleInFlight = null"), "must clear once the read settles");
  assert.ok(core.includes("finally"), "clearing must be in a finally, so a failed read cannot wedge it");
});

test("the DOMParser is constructed once, not per render", () => {
  const core = fs.readFileSync(join(__dirname, "../src/ui/core.js"), "utf8");
  assert.equal((core.match(/new DOMParser\(\)/g) || []).length, 1, "exactly one construction");
  assert.ok(!core.includes("new DOMParser().parseFromString"), "must not build one per call");
});

test("pure selectors apply the same tombstone rules as the async getters", () => {
  const store = fs.readFileSync(join(__dirname, "../src/storage/store.js"), "utf8");
  for (const name of ["selectStudySets", "selectSessions", "selectSettings", "BUNDLE_KEYS"]) {
    assert.ok(store.includes(name), `${name} must be exported from store.js`);
  }
  const sel = store.slice(store.indexOf("export function selectStudySets"));
  assert.ok(sel.includes("!c.deleted"), "selector must hide tombstoned cards");
  assert.ok(sel.includes("!q.deleted"), "selector must hide tombstoned quiz rows");
});

test("native widgets follow the panel theme", () => {
  const css = fs.readFileSync(join(__dirname, "../src/ui/panel.css"), "utf8");
  assert.ok(css.includes("color-scheme: light"), "light theme must declare color-scheme");
  assert.ok(css.includes("color-scheme: dark"), "dark theme must declare color-scheme");
  assert.ok(css.includes("accent-color"), "the picker should use the app accent");

  const html = fs.readFileSync(join(__dirname, "../src/ui/panel.html"), "utf8");
  assert.ok(html.includes('<meta name="color-scheme"'), "panel.html must declare color-scheme meta tag");
  assert.ok(
    css.includes(".date-input") && css.includes("color-scheme: light"),
    "date-input must declare color-scheme for Firefox"
  );
});

test("slots show a skeleton, not a text placeholder", () => {
  const teams = fs.readFileSync(join(__dirname, "../src/ui/views/teams.js"), "utf8");
  assert.ok(teams.includes("teamsSkeleton()"), "the teams slot must start with a skeleton");
  assert.ok(!teams.includes("Loading your teams…"), "the text placeholder should be gone");

  const you = fs.readFileSync(join(__dirname, "../src/ui/views/you.js"), "utf8");
  assert.ok(you.includes("billingSkeleton()"), "the billing slot must start with a skeleton");
  // An empty billing slot is what makes the account block jump down.
  assert.ok(
    !/<div id="billingSlot"><\/div>/.test(you),
    "billingSlot must not render empty — that is the layout jump this change removes"
  );
});

test("skeletons are layout-neutral, delayed, and reduced-motion safe", () => {
  // Normalized: this test slices on "\n}\n" to find the end of the media block,
  // and the working tree is CRLF on Windows (core.autocrlf), where that never
  // matches. CI checks out LF, so an unnormalized read passes there and fails
  // only on the machine doing the release build.
  const css = fs.readFileSync(join(__dirname, "../src/ui/panel.css"), "utf8").replace(/\r\n/g, "\n");
  const skel = css.slice(css.indexOf(".skel {"), css.indexOf(".sk-row"));
  assert.ok(skel.includes("display: contents"), ".skel must not become a flex item and add a gap");
  assert.ok(/animation:[^;]*0\.15s/.test(skel), "the skeleton must fade in on a delay so it cannot flash");

  const rm = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  const block = rm.slice(0, rm.indexOf("\n}\n") + 3);
  assert.ok(block.includes(".sk"), "the pulse must stop under reduced motion");
  assert.ok(
    /\.skel\s*{[^}]*opacity:\s*1/.test(block),
    "reduced motion kills the fade-in, so .skel needs an explicit opacity:1 or it stays invisible"
  );
});

test("skeletons contain no interpolated values", () => {
  for (const [file, fn] of [["../src/ui/views/teams.js", "teamsSkeleton"], ["../src/ui/views/you.js", "billingSkeleton"]]) {
    const src = fs.readFileSync(join(__dirname, file), "utf8");
    const start = src.indexOf(`function ${fn}(`);
    assert.ok(start > -1, `${fn} not found`);
    const body = src.slice(start, src.indexOf("\n}", start));
    assert.ok(!body.includes("${"), `${fn} must be a static template — no unescaped values`);
  }
});

test("checkboxes are custom-drawn, not native", () => {
  const css = fs.readFileSync(join(__dirname, "../src/ui/panel.css"), "utf8");
  const start = css.indexOf('input[type="checkbox"] {');
  assert.ok(start > -1, "a generic checkbox rule must exist");
  const box = css.slice(start, css.indexOf(".pick-row .tag"));

  assert.ok(box.includes("appearance: none"), "the native control must be replaced");
  assert.ok(/clip-path:\s*polygon/.test(box), "the tick must be drawn by us");

  // appearance:none deletes the native focus ring; losing this makes the
  // control keyboard-invisible.
  assert.ok(box.includes(":focus-visible"), "a custom checkbox owes a focus ring");
  // Dark --primary is #35b7b4; a white tick on it is ~2.2:1.
  assert.ok(
    box.includes("box-shadow: inset 1em 1em var(--surface)"),
    "the tick must use --surface so it stays readable on dark mode's brighter teal"
  );
  assert.ok(box.includes("forced-colors: active"), "High Contrast users need the native control back");
  assert.ok(!/accent-color/.test(box), "accent-color is inert once appearance is none");
});

test("the checkbox rule covers both checkboxes in the panel", () => {
  const css = fs.readFileSync(join(__dirname, "../src/ui/panel.css"), "utf8");
  // Scoping the rule to .pick-row would leave Import's toggle looking native.
  assert.ok(
    !/\.pick-row input\[type="checkbox"\] \{\s*appearance/.test(css),
    "the rule must not be scoped to .pick-row — Import has a checkbox too"
  );
  for (const f of ["../src/ui/views/home.js", "../src/ui/views/import.js"]) {
    assert.ok(
      fs.readFileSync(join(__dirname, f), "utf8").includes('type="checkbox"'),
      `${f} still has a checkbox the rule must cover`
    );
  }
});

test("the picker count reflects selection without recolouring .tag globally", () => {
  const css = fs.readFileSync(join(__dirname, "../src/ui/panel.css"), "utf8");
  assert.ok(
    css.includes('.pick-row input[type="checkbox"]:checked ~ .tag'),
    "the count must respond to the checkbox via the sibling combinator"
  );
  assert.ok(!css.includes(":has("), ":has() is not needed here and raises the Firefox floor");
  // .tag is shared with set rows, team rows and the exam header.
  const generic = css.slice(css.indexOf(".tag {"), css.indexOf(".tag.dot"));
  assert.ok(
    !generic.includes("--primary-soft"),
    "recolour .pick-row .tag only — the global .tag is used on other screens"
  );
});

test("the picker row hover is a full-bleed band, not a floating pill", () => {
  const css = fs.readFileSync(join(__dirname, "../src/ui/panel.css"), "utf8");
  const hover = css.slice(css.indexOf(".pick-row:hover"), css.indexOf(".pick-row .name"));
  // A rounded highlight cannot share an edge with the row's square divider.
  assert.ok(!hover.includes("border-radius"), "the hover band must not be rounded");
  assert.ok(hover.includes(":focus-within"), "keyboard focus must get the same feedback as hover");
  // --primary-soft is the checked count chip's background; reusing it here
  // would make the chip vanish into the row it sits on.
  assert.ok(!hover.includes("--primary-soft"), "the hover must stay distinct from the checked chip");

  const row = css.slice(css.indexOf(".pick-row {"), css.indexOf(".pick-row:last-of-type"));
  assert.ok(!/padding:\s*10px 2px/.test(row), "2px of side padding leaves the tint hugging the text");
  assert.ok(row.includes("transition"), "the band must fade in step with the checkbox animation");
});

test("the picker card clips the full-bleed hover to its own radius", () => {
  const css = fs.readFileSync(join(__dirname, "../src/ui/panel.css"), "utf8");
  const block = css.slice(css.indexOf(".pick-block {"), css.indexOf(".pick-row {"));
  assert.ok(block.includes("overflow: hidden"), "without this the end rows square off the card corners");
  assert.ok(/padding:\s*6px 0/.test(block), "horizontal padding belongs to the row now");

  const home = fs.readFileSync(join(__dirname, "../src/ui/views/home.js"), "utf8");
  assert.ok(home.includes('class="block pick-block"'), "the picker container must use the class");
  assert.ok(!home.includes('style="padding:6px 14px"'), "the inline padding should be gone");

  // .block is shared across many screens; some need overflow visible.
  const generic = css.slice(css.indexOf(".block {"), css.indexOf(".block.tint"));
  assert.ok(!generic.includes("overflow"), "do not put overflow on .block itself");
});

test("Teach it back is wired end to end", () => {
  const read = (p) => fs.readFileSync(join(__dirname, p), "utf8").replace(/\r\n/g, "\n");
  assert.ok(read("../src/ui/views/set-detail.js").includes('data-action="start-teach"'), "set detail needs the Teach it back button");
  const panel = read("../src/ui/panel.js");
  for (const a of ["start-teach", "teach-persona", "teach-send", "teach-hint", "teach-finish"]) {
    assert.ok(panel.includes(`case "${a}"`), `panel.js must handle ${a}`);
  }
  const flow = read("../src/ui/flows/teach.js");
  assert.ok(flow.includes('aria-live="polite"'), "the conversation must announce new replies to screen readers");
  assert.ok(flow.includes('kind: "teach"'), "review-log rows must be marked so they don't reschedule cards");
  assert.ok(read("../src/ui/flows/review.js").includes("setTeachState(null)"), "leaving a session must drop its state");
  const sw = read("../src/background/service-worker.js");
  assert.ok(sw.includes('case "TEACH_TURN"') && sw.includes('case "TEACH_EVALUATE"'), "the worker must route both messages");

  assert.ok(flow.includes("teach-persona-chip"), "paintTeachChat renders a persona chip");
  assert.ok(flow.includes("personaInfo("), "paintTeachChat builds it from personaInfo");
  assert.ok(flow.includes("aria-label"), "chip has an aria-label");
  assert.ok(!flow.includes("<button class=\"teach-persona-chip\"") && !flow.includes("data-action=\"teach-persona-chip\""), "the chip is not a button and has no data-action");
  
  assert.ok(flow.includes("Answer the ${"), "textarea placeholder uses the persona");
  assert.ok(flow.includes("The ${"), "typing indicator aria-label uses the persona");
  
  assert.ok(!flow.includes("A curious 12-year-old"), "teach.js contains no hard-coded string");
  assert.ok(flow.includes("PERSONAS.child.option") || flow.includes("personaInfo("), "labels come from PERSONAS");
});


console.log("UX polish (prompt 09)");
const readSrc = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const walkJs = (dir) =>
  fs.readdirSync(new URL(dir, import.meta.url), { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walkJs(dir + d.name + "/") : d.name.endsWith(".js") ? [dir + d.name] : []
  );

test("no native confirm() dialogs in the panel: they ignore the theme and fail in Firefox's sidebar", () => {
  for (const f of walkJs("../src/ui/")) {
    if (f.endsWith("/confirm.js")) continue;
    assert.ok(!/(^|[^.\w])confirm\(/.test(readSrc(f)), f + " still calls confirm()");
  }
  const sheet = readSrc("../src/ui/confirm.js");
  assert.ok(sheet.includes('aria-modal="true"') && sheet.includes("Escape"), "the sheet is a modal dialog that Esc closes");
  assert.ok(readSrc("../src/ui/panel.html").includes('id="sheet"'), "panel.html hosts the sheet");
  assert.ok(readSrc("../src/ui/panel.css").includes(".sheet-box"), "the sheet is styled");
});

test("delete set lives in the More menu, not a bare header icon", () => {
  const detail = readSrc("../src/ui/views/set-detail.js");
  assert.ok(!/class="iconbtn" data-action="delete-set"/.test(detail), "no trash iconbtn in the header");
  assert.ok(detail.includes('role="menuitem" data-action="delete-set"'), "Delete set is a menu item");
  assert.ok(readSrc("../src/ui/panel.js").includes('case "set-menu"'), "panel.js opens the menu");
});

test("Needs work rows are buttons and never say 0 misses", () => {
  const home = readSrc("../src/ui/views/home.js");
  assert.ok(!home.includes("0 miss") && !/\bw\.fails\b/.test(home), "labels come from misses/hards");
  assert.ok(home.includes('<button type="button" class="insight-row" data-action="open-weak"'));
  assert.ok(readSrc("../src/ui/panel.js").includes('case "open-weak"'));
  assert.ok(readSrc("../src/ui/views/set-detail.js").includes("data-card-id="), "card rows can be found by id");
});

test("updates: banner, restart, and the server's outdated reply are all wired", () => {
  const sw = readSrc("../src/background/service-worker.js");
  assert.ok(sw.includes("onUpdateAvailable") && sw.includes('case "APPLY_UPDATE"'), "worker records and applies updates");
  const panel = readSrc("../src/ui/panel.js");
  assert.ok(panel.includes('type: "APPLY_UPDATE"'), "the Restart button sends a message the worker understands");
  assert.ok(!panel.includes('action: "APPLY_UPDATE"'));
  for (const v of ["../src/ui/views/home.js", "../src/ui/views/you.js"]) {
    assert.ok(readSrc(v).includes("updateBannerHtml()"), v + " shows the update banner");
  }
  const auth = readSrc("../src/sync/auth.js");
  assert.ok(auth.includes("x-mafsar-version") && auth.includes("res.status !== 426"), "auth.js sends its version and handles 426");
});

test("delete account: quiet entry on You, calm page, no innerHTML", () => {
  const you = readSrc("../src/ui/views/you.js");
  assert.ok(!you.includes("btn-danger"), "no red button on the You tab");
  assert.ok(you.includes('class="setting-row" data-action="delete-account-open"'), "the page is still reachable");
  const del = readSrc("../src/ui/views/delete-account.js");
  assert.ok(del.includes('class="btn btn-ghost" data-action="nav-back">Cancel'), "a Cancel button");
  assert.ok(del.includes('data-action="export-backup"'), "offers an export first");
  assert.ok(del.includes("data.usage?.plan"), "reads the plan where /v1/me puts it");
  for (const src of [you, del]) {
    assert.ok(!src.includes("innerHTML"), "no innerHTML (AMO rejects it)");
    assert.ok(!src.includes("�"), "no mis-encoded characters");
  }
});


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
  assert.ok(flow.includes("await saveStudySet"), "an override that is not saved is not an override");
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

test("one account's sets are never uploaded to another without an answer", () => {
  const sync = readSrc("../src/sync/sync.js");
  assert.ok(sync.includes("await accountSwitchPending()"), "sync must stop while the switch is unanswered");
  const panel = readSrc("../src/ui/panel.js");
  assert.ok(panel.includes("await showAccountSwitchIfPending()"), "reopening the panel must ask again, not sync");
  for (const action of ["auth-keep-data", "auth-clear-data"]) {
    assert.ok(panel.includes('case "' + action + '"'), "panel must route " + action);
  }
  const you = readSrc("../src/ui/views/you.js");
  assert.ok(you.includes("${esc(email"), "the account email is interpolated, so it must be escaped");
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
  assert.ok(
    !/timedtext|captionTracks/.test(sw),
    "YouTube's caption URLs return empty bodies without a proof-of-origin token: read the transcript panel instead"
  );

  const sets = read("../src/ui/views/sets.js");
  assert.ok(sets.includes('id="captureCurrentBtn"') && sets.includes("refreshCaptureCurrentButton"), "the capture button must carry kind/origin");

  assert.ok(
    /"content-type": "application\/json",\s*\.\.\.\(opts\.headers \|\| \{\}\)/.test(read("../src/sync/auth.js")),
    "authedFetch must let a caller override content-type (the PDF upload sends raw bytes)"
  );
});

console.log(`\n${passed} tests passed`);


