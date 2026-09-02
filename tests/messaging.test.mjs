// Guards for the "listener never replies" class of bug.
//
// Every content script here ends onMessage with `return true`, which promises
// an async reply. A script with no branch for a given message type therefore
// never calls sendResponse, and a caller without a deadline waits forever.
// That is a hang, not an error: the panel sits on "Capturing…", or worse,
// renderSets() never finishes and the Sets view stays permanently blank.
//
// Run: node tests/messaging.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const read = (p) => readFileSync(join(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");

let passed = 0;
const pending = [];
function test(name, fn) {
  // Collect and await. A bare fn() would let an async assertion reject after
  // the run already reported success — how a green suite hides a real failure.
  pending.push(
    Promise.resolve()
      .then(fn)
      .then(() => {
        passed++;
        console.log(`  ✓ ${name}`);
      })
      .catch((e) => {
        console.error(`  ✗ ${name}`);
        throw e;
      })
  );
}

/**
 * Rebuild sendToTab against a stub `chrome`, so the timeout is exercised for
 * real rather than asserted from source text.
 */
function makeSendToTab(chromeStub) {
  const src = read("src/ui/core.js");
  const start = src.indexOf("export function sendToTab");
  assert.ok(start > -1, "sendToTab not found in core.js");
  const end = src.indexOf("\n}", start) + 2;
  const body = src.slice(start, end).replace("export function", "function");
  return new Function("chrome", `${body}; return sendToTab;`)(chromeStub);
}

console.log("sendToTab deadline behaviour");

test("resolves null when the content script never replies", async () => {
  const sendToTab = makeSendToTab({
    runtime: { lastError: null },
    tabs: { sendMessage() { /* `return true` with no matching branch */ } },
  });
  const t0 = Date.now();
  assert.equal(await sendToTab(1, { type: "MAFSAR_PING" }, 60), null, "must resolve null, not hang");
  assert.ok(Date.now() - t0 >= 50, "must actually wait for the deadline");
});

test("resolves the reply when the script does answer", async () => {
  const sendToTab = makeSendToTab({
    runtime: { lastError: null },
    tabs: { sendMessage(_id, _msg, cb) { cb({ ok: true, site: "Claude" }); } },
  });
  assert.deepEqual(await sendToTab(1, {}, 1000), { ok: true, site: "Claude" });
});

test("resolves null on lastError without waiting out the deadline", async () => {
  const sendToTab = makeSendToTab({
    runtime: { lastError: { message: "Could not establish connection." } },
    tabs: { sendMessage(_id, _msg, cb) { cb(undefined); } },
  });
  const t0 = Date.now();
  assert.equal(await sendToTab(1, {}, 5000), null);
  assert.ok(Date.now() - t0 < 1000, "a known error should not wait for the deadline");
});

test("survives sendMessage throwing synchronously", async () => {
  const sendToTab = makeSendToTab({
    runtime: { lastError: null },
    tabs: { sendMessage() { throw new Error("Extension context invalidated."); } },
  });
  assert.equal(await sendToTab(1, {}, 50), null);
});

test("a late reply after the deadline cannot resolve twice", async () => {
  let cb = null;
  const sendToTab = makeSendToTab({
    runtime: { lastError: null },
    tabs: { sendMessage(_id, _msg, fn) { cb = fn; } },
  });
  const p = sendToTab(1, {}, 40);
  assert.equal(await p, null);
  cb({ ok: true }); // arrives late; must not throw or change the settled value
  assert.equal(await p, null);
});

console.log("worker-side discipline");

test("CAPTURE_LAST_ANSWER_SMART routes through askTab, never a bare sendMessage", () => {
  const sw = read("src/background/service-worker.js");
  assert.ok(sw.includes("function askTab("), "askTab helper must exist");
  assert.ok(sw.includes("setTimeout"), "askTab must impose a deadline");
  const smart = sw.slice(
    sw.indexOf('case "CAPTURE_LAST_ANSWER_SMART"'),
    sw.indexOf('case "IMPORT_CARDS"')
  );
  assert.ok(!smart.includes("chrome.tabs.sendMessage"), "must use askTab so it cannot hang");
  assert.ok(smart.includes("askTab("), "…and should actually call askTab");
});

test("every read of the extractor global is null-guarded", () => {
  const lines = read("src/background/service-worker.js").split("\n");
  const reads = [];
  const unguarded = [];
  lines.forEach((line, i) => {
    if (!line.includes("globalThis.__mafsarLastAnswer")) return;
    reads.push(i + 1);
    const name = (line.match(/const\s+(\w+)\s*=/) || [])[1];
    const near = lines.slice(i + 1, i + 4).join("\n");
    const guarded = name && new RegExp("if\\s*\\(!\\s*" + name + "\\b").test(near);
    if (!guarded) unguarded.push(`service-worker.js:${i + 1}  ${line.trim()}`);
  });
  assert.ok(reads.length >= 2, `expected the worker to read the global; found ${reads.length}`);
  assert.deepEqual(
    unguarded,
    [],
    "an unguarded read throws a bare TypeError — the opaque failure this path exists to remove:\n  " +
      unguarded.join("\n  ")
  );
});

console.log("panel-side wiring");

test("tab-watch tolerates an absent tab in the onUpdated signature", () => {
  assert.ok(
    read("src/ui/tab-watch.js").includes("!tab || !tab.active"),
    "an unguarded tab.active throws inside the listener and kills the watcher"
  );
});

test("isAIChatTab's ping fallback goes through the deadline-bearing helper", () => {
  const core = read("src/ui/core.js");
  const fn = core.slice(core.indexOf("export async function isAIChatTab"));
  const body = fn.slice(0, fn.indexOf("\n}") + 2);
  assert.ok(body.includes("sendToTab("), "must reuse sendToTab, not a raw sendMessage");
  assert.ok(!body.includes("chrome.tabs.sendMessage"), "a raw call here would hang renderSets()");
});

test("content scripts answer every message type the panel and worker send", () => {
  const cap = read("src/content/capture.js");
  const listener = cap.slice(cap.indexOf("onMessage.addListener"));
  for (const type of ["CAPTURE_ACTIVE", "CAPTURE_LAST_ANSWER", "GET_MESSAGES", "MAFSAR_PING"]) {
    assert.ok(listener.includes(`"${type}"`), `${type} branch missing — callers would hang`);
  }
  assert.ok(
    (listener.match(/sendResponse\(/g) || []).length >= 4,
    "every branch must reply; a silent branch is a hang"
  );
});

await Promise.all(pending);
console.log(`\n${passed} tests passed`);
