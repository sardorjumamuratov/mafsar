// Which tab a capture reads. With Mafsar open in a tab of its own, the "active
// tab" is Mafsar itself, so a worker that guesses reads its own page and fails.
// The panel knows the right tab and sends it; the worker only guesses when a
// caller doesn't say, and never captures one of its own pages.
// Run: node tests/capture-target.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { isOwnPage, resolveCaptureTab } from "../src/background/capture-target.js";

const here = import.meta.dirname;
const read = (p) => fs.readFileSync(path.join(here, p), "utf8").replace(/\r\n/g, "\n");

let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const OWN = "chrome-extension://abcdefgh/";
const MAFSAR_TAB = { id: 1, url: OWN + "src/ui/panel.html" };
const CHAT_TAB = { id: 2, url: "https://chatgpt.com/c/123" };

/** chrome.tabs, promise-shaped, with Mafsar as the active tab (tab mode). */
function tabsWith({ active = MAFSAR_TAB, all = [MAFSAR_TAB, CHAT_TAB] } = {}) {
  return {
    query: async () => (active ? [active] : []),
    get: async (id) => all.find((t) => t.id === id) || null,
  };
}

console.log("resolving the tab to capture");

await test("uses the tab the panel sent, even when Mafsar is the active tab", async () => {
  const tab = await resolveCaptureTab({ tabId: 2 }, tabsWith(), OWN);
  assert.equal(tab.id, 2);
});

await test("falls back to the active tab when no tab is sent (sidebar mode)", async () => {
  const tab = await resolveCaptureTab({}, tabsWith({ active: CHAT_TAB }), OWN);
  assert.equal(tab.id, 2);
});

await test("never captures one of Mafsar's own pages", async () => {
  await assert.rejects(() => resolveCaptureTab({}, tabsWith(), OWN), /page you want to capture/);
  await assert.rejects(() => resolveCaptureTab({ tabId: 1 }, tabsWith(), OWN), /page you want to capture/);
});

await test("a tab that has closed since is a clear error, not a crash", async () => {
  await assert.rejects(() => resolveCaptureTab({ tabId: 99 }, tabsWith(), OWN), /No page to capture/);
  await assert.rejects(() => resolveCaptureTab({}, tabsWith({ active: null }), OWN), /No page to capture/);
});

await test("own pages are recognised in both browsers", async () => {
  assert.equal(isOwnPage(OWN + "src/ui/panel.html", OWN), true);
  assert.equal(isOwnPage("moz-extension://1234/src/ui/panel.html", "moz-extension://1234/"), true);
  assert.equal(isOwnPage("https://chatgpt.com/", OWN), false);
  assert.equal(isOwnPage(undefined, OWN), false);
  assert.equal(isOwnPage("chrome-extension://someone-else/x.html", OWN), false, "another extension's page isn't ours to refuse");
});

console.log("wiring");

await test("both panel captures tell the worker which tab", async () => {
  const cap = read("../src/ui/capture.js");
  assert.ok(/type: "CAPTURE_UNIVERSAL", tabId:/.test(cap), "the universal fallback must send the tab the panel resolved");
  assert.ok(/type: "CAPTURE_LAST_ANSWER_SMART", tabId:/.test(cap), "capture last answer must send the tab too");
});

await test("the worker's capture handlers resolve through one place", async () => {
  const sw = read("../src/background/service-worker.js");
  assert.ok(/const captureTab = \(msg\) => resolveCaptureTab\(/.test(sw), "captureTab must be the shared resolver");
  for (const type of ["CAPTURE_UNIVERSAL", "CAPTURE_LAST_ANSWER_SMART"]) {
    const start = sw.indexOf(`case "${type}"`);
    const body = sw.slice(start, sw.indexOf("case ", start + 10));
    assert.ok(body.includes("captureTab(msg)"), `${type} must resolve its tab through captureTab`);
    assert.ok(!body.includes("active: true"), `${type} must not guess the active tab itself`);
  }
});

console.log("opening Mafsar as a tab");

await test("the first capture knows the page the learner came from", async () => {
  // A fresh Mafsar tab has seen no tab events yet. It must not need the
  // learner to switch away and back before a capture can find the chat.
  const now = Date.now();
  global.chrome = {
    runtime: { getURL: (p = "") => OWN + p },
    tabs: {
      onActivated: { addListener() {} },
      onUpdated: { addListener() {} },
      query: (_q, cb) => cb([
        { id: 1, url: OWN + "src/ui/panel.html", lastAccessed: now },
        { id: 5, url: "https://example.com/old", lastAccessed: now - 60_000 },
        { id: 2, url: "https://chatgpt.com/c/123", lastAccessed: now - 1_000 },
      ]),
    },
    windows: { onFocusChanged: { addListener() {} } },
  };
  const watch = await import("../src/ui/tab-watch.js?fresh=1");
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(watch.getLastContentTabId(), 2, "the most recently used ordinary tab, not Mafsar and not an older one");
});

console.log(`\n${passed} passed`);
