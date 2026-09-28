// YouTube capture reads the captions the video player itself loads.
//
// Checked live on 2026-09-28 against a 79-minute MIT OpenCourseWare lecture:
// YouTube's transcript panel stayed on a spinner because its get_transcript call
// came back 400 without a proof-of-origin token, so the panel scraper returned
// "scraper-failed". The player's own /api/timedtext request carries that token
// and returned the full transcript (1,721 lines, 12,593 words). Capture now
// watches for that request instead of relying on the panel.
// Run: node tests/youtube-captions.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { json3ToSegments, transcriptToText } from "../src/storage/sources.js";

const here = import.meta.dirname;
const read = (p) => fs.readFileSync(path.join(here, p), "utf8").replace(/\r\n/g, "\n");

let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

// The shape YouTube's player receives (fmt=json3), trimmed to a few events.
const JSON3 = JSON.stringify({
  wireMagic: "pb3",
  pens: [{}],
  events: [
    { tStartMs: 0, dDurationMs: 1000, id: 1, wpWinPosId: 1 },
    { tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: "[SQUEAKING]" }] },
    { tStartMs: 18000, dDurationMs: 3000, segs: [{ utf8: "So today we're" }, { utf8: " going to talk" }] },
    { tStartMs: 21000, dDurationMs: 50, segs: [{ utf8: "\n" }] },
    { tStartMs: 21050, dDurationMs: 3000, segs: [{ utf8: "about strings." }] },
    { tStartMs: 4729000, dDurationMs: 2000, segs: [{ utf8: "I won't do that again." }] },
  ],
});

console.log("turning the player's captions into text");

await test("events become timed segments; line breaks and empty events are dropped", async () => {
  const segs = json3ToSegments(JSON3);
  assert.deepEqual(segs.map((s) => s.text), [
    "[SQUEAKING]",
    "So today we're going to talk",
    "about strings.",
    "I won't do that again.",
  ]);
  assert.equal(segs[1].start, "18", "seconds, in the form parseTimestamp reads");
  assert.equal(segs.at(-1).start, "4729");
});

await test("the result reads as text, with sound cues gone", async () => {
  const text = transcriptToText(json3ToSegments(JSON3));
  assert.ok(!text.includes("[SQUEAKING]"));
  assert.ok(text.includes("So today we're going to talk about strings."));
});

await test("anything that isn't caption JSON gives no segments rather than a crash", async () => {
  for (const bad of ["", "not json", "{}", '{"events":null}', null, undefined]) {
    assert.deepEqual(json3ToSegments(bad), []);
  }
});

console.log("capturing the player's caption request in the page");

// Pull the real injected function out of the worker, the way scraper.test does.
const sw = read("../src/background/service-worker.js");
const src = sw.match(/async function extractYouTubeTranscript\(\) \{[\s\S]*?return \{ ok: true, title, segments \};\s*\}/)[0];

/** A watch page with a CC button that makes the player request captions. */
function setupPage({ captionsOn = false, captions = JSON3, hasCaptions = true } = {}) {
  const origOpen = function () {};
  class FakeXHR {
    open(_m, url) { this.url = url; }
    addEventListener(type, fn) { if (type === "load") this.onload = fn; }
  }
  FakeXHR.prototype.open = function (_m, url) { this.url = url; };
  FakeXHR.prototype.addEventListener = function (type, fn) { if (type === "load") this.onload = fn; };
  const pristineOpen = FakeXHR.prototype.open;
  globalThis.XMLHttpRequest = FakeXHR;
  globalThis.window = globalThis;
  globalThis.fetch = async () => ({ ok: false });

  const btn = {
    pressed: captionsOn,
    clicks: 0,
    getAttribute(name) {
      if (name === "aria-pressed") return String(this.pressed);
      if (name === "aria-disabled") return hasCaptions ? "false" : "true";
      return null;
    },
    style: {},
    click() {
      this.clicks++;
      this.pressed = !this.pressed;
      if (this.pressed && hasCaptions) {
        // The player fetches the track, signed with its proof-of-origin token.
        setTimeout(() => {
          const xhr = new XMLHttpRequest();
          xhr.open("GET", "https://www.youtube.com/api/timedtext?v=x&pot=TOKEN&fmt=json3");
          xhr.status = 200;
          xhr.responseText = captions;
          xhr.onload?.();
        }, 10);
      }
    },
  };
  globalThis.document = {
    title: "Lecture 2: Strings - YouTube",
    querySelector: (sel) => (sel === ".ytp-subtitles-button" ? btn : sel === "h1.ytd-watch-metadata" ? { textContent: "Lecture 2: Strings" } : null),
    querySelectorAll: () => [],
  };
  return { btn, pristineOpen, FakeXHR, origOpen };
}

const extract = () => new Function(`${src}\nreturn extractYouTubeTranscript();`)();

await test("reads the captions the player loads when CC is switched on", async () => {
  setupPage();
  const r = await extract();
  assert.equal(r.ok, true);
  assert.equal(r.title, "Lecture 2: Strings");
  assert.equal(json3ToSegments(r.json3).length, 4, "the full caption body comes back for the worker to parse");
});

await test("leaves captions off if the learner had them off", async () => {
  const { btn } = setupPage({ captionsOn: false });
  await extract();
  assert.equal(btn.pressed, false, "turned back off afterwards");
});

await test("leaves captions on if they were on, and still gets a fresh request", async () => {
  const { btn } = setupPage({ captionsOn: true });
  const r = await extract();
  assert.equal(r.ok, true);
  assert.equal(btn.pressed, true, "still on afterwards");
  assert.ok(btn.clicks >= 2, "off and on again forces the player to request the track");
});

await test("puts the page's XMLHttpRequest back exactly as it found it", async () => {
  const { pristineOpen, FakeXHR } = setupPage();
  await extract();
  assert.equal(FakeXHR.prototype.open, pristineOpen, "a hooked XHR left behind would watch every request on the page");
});

await test("a hidden CC button still works — YouTube hides it even when captions are on", async () => {
  // Found live: the only .ytp-subtitles-button carried style="display: none"
  // with aria-pressed="true" on a lecture that had captions.
  const { btn } = setupPage({ captionsOn: true });
  btn.style = { display: "none" };
  const r = await extract();
  assert.equal(r.ok, true, "a hidden button must not be read as 'no captions'");
  assert.ok(r.json3);
});

await test("a video without captions still reports that honestly", async () => {
  setupPage({ hasCaptions: false });
  const r = await extract();
  assert.equal(r.ok, false);
  assert.equal(r.reason, "no-transcript");
});

console.log("wiring");

await test("the extractor runs in the page's own world, where the player's requests are", async () => {
  const cap = sw.slice(sw.indexOf("async function captureYouTube"));
  const body = cap.slice(0, cap.indexOf("\n}\n"));
  assert.ok(/world:\s*"MAIN"/.test(body), "the isolated world has its own XMLHttpRequest and never sees the player's");
  assert.ok(body.includes("json3ToSegments("), "the worker parses the caption body with the tested helper");
});

console.log(`\n${passed} passed`);
