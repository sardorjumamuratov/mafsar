// Clicking the toolbar icon must open or close Mafsar. Browsers only allow
// sidebarAction.toggle() (Firefox) and sidePanel.open() (Chrome) synchronously
// inside the click: after an `await`, the call no longer counts as the user's,
// it is refused, and the icon does nothing at all. That shipped once — the
// handler read the "open in a tab" setting from storage first.
//
// These tests load the real service worker and fire its click listener.
// Run: node tests/toolbar-click.test.mjs
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const REPO = path.join(import.meta.dirname, "..");
const OWN = "moz-extension://abc/";

/** A chrome.* stub: the parts the worker touches at load, recorded or no-op. */
function makeChrome({ firefox = true, settings = {}, mirror } = {}) {
  const calls = { toggle: 0, sidePanelOpen: 0, tabsCreate: [], panelBehavior: [] };
  const listeners = { click: null, storage: [] };
  const store = { settings };
  const noopEvent = { addListener() {}, removeListener() {} };
  const local = new Map(mirror === undefined ? [] : [["mafsar.openInTab", mirror]]);
  globalThis.localStorage = firefox
    ? { getItem: (k) => (local.has(k) ? local.get(k) : null), setItem: (k, v) => local.set(k, String(v)) }
    : undefined;
  const chrome = {
    runtime: {
      getURL: (p = "") => OWN + p,
      getManifest: () => ({ version: "0.4.0" }),
      onMessage: noopEvent, onInstalled: noopEvent, onUpdateAvailable: noopEvent, onStartup: noopEvent,
      lastError: null,
    },
    storage: {
      local: {
        get: (keys, cb) => {
          const out = {};
          for (const k of Array.isArray(keys) ? keys : [keys]) if (store[k] !== undefined) out[k] = store[k];
          if (cb) setTimeout(() => cb(out), 5);
          return new Promise((r) => setTimeout(() => r(out), 5));
        },
        set: (obj, cb) => { Object.assign(store, obj); cb?.(); return Promise.resolve(); },
        remove: (_k, cb) => { cb?.(); return Promise.resolve(); },
      },
      onChanged: { addListener: (fn) => listeners.storage.push(fn) },
    },
    action: { onClicked: { addListener: (fn) => { listeners.click = fn; } } },
    tabs: {
      query: (_q, cb) => { cb?.([]); return Promise.resolve([]); },
      create: (opts) => { calls.tabsCreate.push(opts); return Promise.resolve({ id: 9 }); },
      update: () => Promise.resolve(), get: (_id, cb) => cb?.(null),
      onActivated: noopEvent, onUpdated: noopEvent, onRemoved: noopEvent,
    },
    windows: { update: () => Promise.resolve(), onFocusChanged: noopEvent },
    contextMenus: { create() {}, removeAll: (cb) => cb?.(), onClicked: noopEvent },
    notifications: { create() {} },
    scripting: { executeScript() {} },
    permissions: { contains: (_p, cb) => cb?.(true) },
    alarms: { create() {}, onAlarm: noopEvent },
  };
  if (firefox) chrome.sidebarAction = { toggle: () => { calls.toggle++; }, open: () => { calls.toggle++; } };
  else chrome.sidePanel = {
    open: () => { calls.sidePanelOpen++; return Promise.resolve(); },
    setPanelBehavior: (b) => { calls.panelBehavior.push(b); return Promise.resolve(); },
  };
  return { chrome, calls, listeners, store };
}

let n = 0;
async function loadWorker(opts) {
  const env = makeChrome(opts);
  globalThis.chrome = env.chrome;
  await import(pathToFileURL(path.join(REPO, "src/background/service-worker.js")).href + `?load=${++n}`);
  return env;
}

const settle = () => new Promise((r) => setTimeout(r, 30));

let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("Firefox sidebar");

await test("a click toggles the sidebar within the click, not after an await", async () => {
  const { calls, listeners } = await loadWorker({ firefox: true });
  assert.ok(listeners.click, "the worker must register a toolbar click listener");
  listeners.click({ id: 2, windowId: 1 });
  // Checked synchronously: anything that happens after an await is too late.
  assert.equal(calls.toggle, 1, "sidebarAction.toggle() must run synchronously inside the click");
});

await test("a cold start (the click is what woke the page) still toggles", async () => {
  // Storage hasn't answered yet when the click arrives.
  const { calls, listeners } = await loadWorker({ firefox: true });
  listeners.click({ id: 2, windowId: 1 });
  assert.equal(calls.toggle, 1);
});

await test("tab mode opens a Mafsar tab instead, even on a cold start", async () => {
  // The preference is mirrored somewhere synchronous, because the async
  // storage read is still pending when the click that woke the page arrives.
  const { calls, listeners } = await loadWorker({ firefox: true, settings: { openInTab: true }, mirror: "1" });
  listeners.click({ id: 2, windowId: 1 });
  await settle();
  assert.equal(calls.toggle, 0, "tab mode must not toggle the sidebar");
  assert.equal(calls.tabsCreate.length, 1, "tab mode opens Mafsar in a tab");
});

await test("turning tab mode on is picked up without a restart", async () => {
  const { calls, listeners, store } = await loadWorker({ firefox: true });
  await settle();
  store.settings = { openInTab: true };
  for (const fn of listeners.storage) fn({ settings: { newValue: { openInTab: true } } }, "local");
  listeners.click({ id: 2, windowId: 1 });
  await settle();
  assert.equal(calls.toggle, 0);
  assert.equal(calls.tabsCreate.length, 1);
});

console.log("Chrome side panel");

await test("the panel behaviour is re-asserted on every worker start, not only on install", async () => {
  const { calls } = await loadWorker({ firefox: false });
  await settle();
  assert.ok(calls.panelBehavior.length >= 1, "without it the icon can go dead after a worker restart");
  assert.deepEqual(calls.panelBehavior.at(-1), { openPanelOnActionClick: true });
});

await test("tab mode tells Chrome not to open the panel itself", async () => {
  const { calls } = await loadWorker({ firefox: false, settings: { openInTab: true } });
  await settle();
  assert.deepEqual(calls.panelBehavior.at(-1), { openPanelOnActionClick: false });
});

await test("the Chrome fallback opens the side panel within the click", async () => {
  const { calls, listeners } = await loadWorker({ firefox: false });
  listeners.click({ id: 2, windowId: 1 });
  assert.equal(calls.sidePanelOpen, 1, "sidePanel.open() must run synchronously inside the click");
});

console.log(`\n${passed} passed`);
