// Static guards for the system design practice screens (docs/prompts/38).
// Run: node tests/system-design-practice.test.mjs
//
// The first merge of this feature shipped a panel that never loaded: a flow
// imported a name its module didn't export, and another file was pasted in
// twice. These checks catch that class of mistake without a browser.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const here = import.meta.dirname;
const read = (p) => fs.readFileSync(path.join(here, p), "utf8").replace(/\r\n/g, "\n");
let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const FLOWS = ["design", "estimation", "bottleneck", "clinical", "chain-drill"].map((f) => `../src/ui/flows/${f}.js`);
const UI = [...FLOWS, "../src/ui/flows/shell.js", "../src/ui/practice-ui.js", "../src/ui/views/set-detail.js", "../src/ui/views/you.js", "../src/ui/panel.js"];

/** Named imports per relative module, e.g. { "./shell.js": ["icon", "paintShell"] }. */
function namedImports(src) {
  const out = [];
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"([^"]+)"/g)) {
    out.push({ names: m[1].split(",").map((n) => n.trim().split(/\s+as\s+/)[0]).filter(Boolean), from: m[2] });
  }
  return out;
}
function exportsOf(src) {
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z0-9_$]+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) m[1].split(",").forEach((n) => { const k = n.trim().split(/\s+as\s+/).pop(); if (k) names.add(k); });
  return names;
}

console.log("modules load");
test("every named import in the practice screens exists in its module", () => {
  for (const file of UI) {
    const src = read(file);
    for (const { names, from } of namedImports(src)) {
      if (!from.startsWith(".")) continue;
      const target = path.join(path.dirname(file), from);
      const exported = exportsOf(read(target));
      for (const n of names) assert.ok(exported.has(n), `${file} imports ${n} from ${from}, which doesn't export it`);
    }
  }
});

test("no file declares the same import or top-level function twice", () => {
  for (const file of UI) {
    const src = read(file);
    const seen = new Set();
    for (const { names, from } of namedImports(src)) {
      for (const n of names) {
        assert.ok(!seen.has(n), `${file} imports ${n} twice (from ${from})`);
        seen.add(n);
      }
    }
    const fns = [...src.matchAll(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/gm)].map((m) => m[1]);
    assert.equal(new Set(fns).size, fns.length, `${file} declares a function twice`);
  }
});

console.log("wiring");
test("every data-action the practice screens render has a case in the router", () => {
  const panel = read("../src/ui/panel.js");
  const actions = new Set();
  for (const file of [...FLOWS, "../src/ui/flows/shell.js", "../src/ui/views/set-detail.js", "../src/ui/views/you.js"]) {
    const src = read(file);
    for (const m of src.matchAll(/data-action="([a-z0-9-]+)"/g)) actions.add(m[1]);
    for (const m of src.matchAll(/(?:primaryBtn|secondaryBtn|textBtn)\("([a-z0-9-]+)"/g)) actions.add(m[1]);
  }
  for (const a of actions) {
    if (/^(set-menu|more-|add-|tab$|card-|exam-)/.test(a)) continue; // set-detail's own local handlers
    assert.ok(panel.includes(`case "${a}"`), `panel.js has no case for data-action="${a}"`);
  }
});

test("every message the practice screens send is routed by the worker, and the new fields get through", () => {
  const sw = read("../src/background/service-worker.js");
  const api = read("../src/sync/api.js");
  const sent = new Set();
  for (const file of [...FLOWS, "../src/ui/flows/shell.js"]) for (const m of read(file).matchAll(/type:\s*"([A-Z_]+)"/g)) sent.add(m[1]);
  for (const type of sent) assert.ok(sw.includes(`case "${type}"`), `the worker doesn't route ${type}`);
  const block = (type) => sw.slice(sw.indexOf(`case "${type}"`), sw.indexOf(`case "${type}"`) + 900);
  for (const type of ["DESIGN_TASK", "DESIGN_GRADE", "DESIGN_CHECKPOINT", "ESTIMATION_TASK", "ESTIMATION_SUMMARY", "BOTTLENECK_TASK", "BOTTLENECK_GRADE", "DRILL_CARD_SUGGESTIONS", "CLINICAL_CASE", "CLINICAL_CHECK"]) {
    assert.ok(block(type).includes("practiceStyle"), `${type} must forward practiceStyle`);
  }
  assert.ok(block("DESIGN_GRADE").includes("answers"), "structured design answers reach the server");
  assert.ok(block("BOTTLENECK_GRADE").includes("parts") && block("BOTTLENECK_GRADE").includes("selectedComponentId"), "guided parts and the marked component reach the server");
  assert.ok(block("BOTTLENECK_HINT").includes("level"), "the hint level reaches the server");
  assert.ok(block("CLINICAL_CASE").includes("level") && block("CLINICAL_CASE").includes("chains"), "the level and the chains reach the case writer");
  assert.ok(block("CLINICAL_CHECK").includes("ordered") && block("CLINICAL_CHECK").includes("finish"), "the end-of-case flags reach the server");
  assert.ok(!/callApi|sendResponse\(/.test(block("DESIGN_CHECKPOINT")), "the checkpoint uses the shared api client");
  assert.ok(api.includes('post("/v1/design-checkpoint"') && api.includes('post("/v1/drill-card-suggestions"'));
  assert.ok(api.includes("code: data.error"), "the machine code survives for feature_disabled and friends");
  assert.ok(read("../src/ui/core.js").includes("code: resp?.code"), "send() keeps the code from the worker");
});

test("hints go through the token the server returns", () => {
  const flow = read("../src/ui/flows/bottleneck.js");
  assert.ok(flow.includes("s.task.state = res.state"), "grading must see the hint recorded in the new state");
});

console.log("copy and rules");
test("the spec's wording, and no promise of a written model answer", () => {
  const all = UI.map(read).join("\n") + read("../src/storage/practice-style.js");
  assert.ok(!/See a model answer/.test(all));
  for (const s of [
    "What are you practicing for?", "You can change this anytime in Practice settings.",
    "Get guidance, optional hints, and feedback as you go.", "Practice under realistic conditions and review feedback at the end.",
    "Building a design exercise from your cards…", "Creating estimation questions from this set…", "Setting up an architecture to debug…",
    "Compare your approach", "Compare your diagnosis", "Turn gaps into review cards", "Add selected cards", "Not now",
    "Check my thinking", "I'm not sure", "Improve this", "Your design outline", "Unanswered areas will be marked as skipped.",
    "Show rough working (optional)", "Traffic assumption", "Unit mismatch", "Marked as a possible bottleneck.", "I think it is elsewhere",
    "Strongest part", "Highest-leverage gap", "Strongest habit", "Most useful habit to improve", "Hint used", "Get a hint",
  ]) assert.ok(all.includes(s), `missing copy: ${s}`);
  assert.ok(!/Blank canvas|strict grading/i.test(all), "simulation still has a hint; don't describe it as having none");
  assert.ok(!/Great job|Perfect|\bWrong\b/.test(all), "copy rules: no harsh or gushing words");
});

test("the clinical case keeps its own wording, and says when something isn't from the notes", () => {
  const clinical = read("../src/ui/flows/clinical.js");
  assert.ok(!clinical.includes("Compare your diagnosis"), "that label belongs to What breaks");
  assert.ok(clinical.includes("General knowledge, not from your notes"), "anything outside the notes is labelled");
});

test("a new screen clears the previous screen's review-card handler", () => {
  const shell = read("../src/ui/flows/shell.js");
  const fn = shell.slice(shell.indexOf("export function paintShell"));
  assert.ok(fn.slice(0, fn.indexOf("\n}")).includes("reviewCardsHandler = null"));
});

test("no emoji, no red, no hex outside the theme blocks in the new styles", () => {
  const all = UI.map(read).join("\n");
  assert.ok(!/\p{Extended_Pictographic}/u.test(FLOWS.map(read).join("\n") + read("../src/ui/practice-ui.js")));
  assert.ok(!/danger/.test(FLOWS.map(read).join("\n")), "learning mistakes are amber, never red");
  const css = read("../src/ui/panel.css");
  const block = css.slice(css.indexOf("System design practice (docs/prompts/38)"));
  assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(block), "colours come from tokens");
  assert.ok(all.length > 0);
});

console.log(`\n${passed} passed`);
