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
  // signed-out early return + normal path), team detail, you, auth gate.
  const callSites = src.split("topOfView();").length - 1;
  assert.equal(callSites, 12, "exactly the view-renderer exits reset scroll");
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
  const css = fs.readFileSync(join(__dirname, "../src/ui/panel.css"), "utf8");
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

console.log(`\n${passed} tests passed`);
