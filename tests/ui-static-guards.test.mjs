// Safety guards restored from tests/ui-static.test.mjs. The redesign branch
// deleted 38 tests from that file; about half pinned screens that no longer
// exist, but these pin rules that don't depend on the design (escaping,
// local-first paint, skeletons, stale-response guards, host permissions), so
// they come back verbatim, except the three noted where the redesign changed
// the mechanism. Run: node tests/ui-static-guards.test.mjs

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
function bodyOf(src, name) {
  const start = src.indexOf(`export async function ${name}(`);
  assert.ok(start > -1, `${name} not found`);
  const next = src.indexOf("\nexport ", start + 1);
  return src.slice(start, next === -1 ? src.length : next);
}
const readSrc = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const walkJs = (dir) =>
  fs.readdirSync(new URL(dir, import.meta.url), { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walkJs(dir + d.name + "/") : d.name.endsWith(".js") ? [dir + d.name] : []
  );

let passed = 0;
const failed = [];
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed.push(name);
    console.error(`  ✗ ${name}\n    ${String(e.message).split("\n")[0]}`);
  }
}

test('import builds fresh ids and fresh schedules, no sender fields', () => {
  const fn = fs.readFileSync(join(__dirname, "../src/ui/views/import.js"), "utf8");
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

test('share link helpers come from the pure module', () => {
  assert.ok(src.includes("share-link.js"));
  assert.ok(src.includes('shareLinkFor(code, LANDING_BASE)'));
  assert.ok(src.includes('parseShareCode('));
  assert.ok(src.includes('parseTeamCode('));
});

test('capture.js does not swallow generation failure reasons', () => {
  // Redesign 05: the reason picks one of several actionable toasts (sign in,
  // quota, couldn't make cards) instead of being shown raw. It must still be
  // read, and a saved-but-failed capture must still say so.
  const cap = fs.readFileSync(join(__dirname, "../src/ui/capture.js"), "utf8");
  assert.ok(cap.includes("r.reason && r.reason.includes(\"signed in\")"), "sign-in failures get their own toast");
  assert.ok(cap.includes("Saved · couldn't make cards"), "any other generation failure is reported");
});

test('panel.js sign out redirects to auth gate', () => {
  const pan = fs.readFileSync(join(__dirname, "../src/ui/panel.js"), "utf8");
  assert.ok(pan.includes('renderAuthGate()'));
  assert.ok(pan.includes('logout().then(() => {'));
  assert.ok(pan.includes('.catch((e) => toast(e.message))'));
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

  // Redesign 05: "Capturing…" is now the dock button's label, not a sticky
  // toast. The same guarantee: the busy state is always cleared, on every path.
  const cap = fs.readFileSync(join(__dirname, "../src/ui/capture.js"), "utf8");
  assert.ok(cap.includes("setCapturingState(true"), "capture shows it is busy");
  const finallies = (cap.match(/\}\s*finally\s*\{\s*setCapturingState\(false\)/g) || []).length;
  const starts = (cap.match(/setCapturingState\(true/g) || []).length;
  assert.equal(finallies, starts, "every busy state is cleared in a finally");
});

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

test("Teach it back is wired end to end", () => {
  const read = (p) => fs.readFileSync(join(__dirname, p), "utf8").replace(/\r\n/g, "\n");
  assert.ok(read("../src/ui/views/set-detail.js").includes('data-action="start-teach"'), "set detail needs the Teach it back button");
  const panel = read("../src/ui/panel.js");
  for (const a of ["start-teach", "teach-persona", "teach-send", "teach-hint", "teach-finish"]) {
    assert.ok(panel.includes(`case "${a}"`), `panel.js must handle ${a}`);
  }
  const flow = read("../src/ui/flows/teach.js");
  assert.ok(read("../src/ui/flows/shell.js").includes('aria-live="polite"') && flow.includes("thread:"), "the conversation must announce new replies to screen readers");
  assert.ok(flow.includes('kind: "teach"'), "review-log rows must be marked so they don't reschedule cards");
  assert.ok(read("../src/ui/flows/review.js").includes("setTeachState(null)"), "leaving a session must drop its state");
  const sw = read("../src/background/service-worker.js");
  assert.ok(sw.includes('case "TEACH_TURN"') && sw.includes('case "TEACH_EVALUATE"'), "the worker must route both messages");

  assert.ok(flow.includes('class="who" role="note"'), "paintTeachChat labels the audience above each reply");
  assert.ok(flow.includes("personaInfo("), "paintTeachChat builds it from personaInfo");
  assert.ok(flow.includes("aria-label"), "the typing indicator has an aria-label");
  assert.ok(!/class="who"[^>]*data-action/.test(flow), "the audience label is not a button and has no data-action");
  


  assert.ok(flow.includes("The ${"), "typing indicator aria-label uses the persona");
  
  assert.ok(!flow.includes("A curious 12-year-old"), "teach.js contains no hard-coded string");
  assert.ok(flow.includes("PERSONAS.child.option") || flow.includes("personaInfo("), "labels come from PERSONAS");
});

test("delete account: quiet entry on You, calm page, no innerHTML", () => {
  const you = readSrc("../src/ui/views/you.js");
  assert.ok(!you.includes("btn-danger"), "no red button on the You tab");
  // A settings row like the others, not a button (the You tab prompt).
  assert.ok(you.includes("attrs: 'data-action=\"delete-account-open\"'"), "the page is still reachable");
  const del = readSrc("../src/ui/views/delete-account.js");
  assert.ok(del.includes('class="btn btn-ghost" data-action="nav-back">Cancel'), "a Cancel button");
  assert.ok(del.includes('data-action="export-backup"'), "offers an export first");
  assert.ok(del.includes("data.usage?.plan"), "reads the plan where /v1/me puts it");
  for (const src of [you, del]) {
    assert.ok(!src.includes("innerHTML"), "no innerHTML (AMO rejects it)");
    assert.ok(!src.includes("�"), "no mis-encoded characters");
  }
});

// The panel's confirm sheet (its old name had "'s sidebar" on the end, which
// the extraction missed).
test("no native confirm() dialogs in the panel: they ignore the theme and fail in Firefox", () => {
  for (const f of walkJs("../src/ui/")) {
    if (f.endsWith("/confirm.js")) continue;
    assert.ok(!/(^|[^.\w])confirm\(/.test(readSrc(f)), f + " still calls confirm()");
  }
  const sheet = readSrc("../src/ui/sheet.js");
  assert.ok(sheet.includes('"aria-modal", "true"') && sheet.includes("Escape"), "the sheet is a modal dialog that Esc closes");
});

console.log(`\n${passed} passed, ${failed.length} failed`);
if (failed.length) process.exit(1);
