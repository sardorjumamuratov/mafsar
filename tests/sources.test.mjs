// What "Capture this page" is looking at, and how extracted text is shaped.
// Run: node tests/sources.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  MAX_CAPTURE_CHARS, captureNote, classifyUrl, parseTimestamp,
  pdfTitleFromUrl, sampleForGeneration, transcriptToText, truncateForGeneration,
} from "../src/storage/sources.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("classifyUrl");

test("YouTube watch pages, with or without extra parameters", () => {
  assert.deepEqual(classifyUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s"), {
    kind: "youtube", videoId: "dQw4w9WgXcQ", origin: "https://www.youtube.com",
  });
  assert.equal(classifyUrl("https://m.youtube.com/watch?v=dQw4w9WgXcQ").origin, "https://m.youtube.com");
});

test("Shorts, live and youtu.be links", () => {
  assert.equal(classifyUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ").kind, "youtube");
  assert.equal(classifyUrl("https://www.youtube.com/live/dQw4w9WgXcQ").kind, "youtube");
  assert.deepEqual(classifyUrl("https://youtu.be/dQw4w9WgXcQ"), {
    kind: "youtube", videoId: "dQw4w9WgXcQ", origin: "https://www.youtube.com",
  });
});

test("YouTube pages that aren't a video, and lookalike hosts, are ordinary pages", () => {
  assert.equal(classifyUrl("https://www.youtube.com/").kind, "page");
  assert.equal(classifyUrl("https://www.youtube.com/@somechannel").kind, "page");
  assert.equal(classifyUrl("https://www.youtube.com/watch?v=short").kind, "page");
  assert.equal(classifyUrl("https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ").kind, "page");
});

test("PDFs on the web, including query strings and upper case", () => {
  assert.deepEqual(classifyUrl("https://example.edu/notes/Lecture%203.pdf?dl=1"), {
    kind: "pdf", origin: "https://example.edu", local: false,
  });
  assert.equal(classifyUrl("https://example.edu/SLIDES.PDF").kind, "pdf");
});

test("local PDFs are recognised but marked local", () => {
  assert.deepEqual(classifyUrl("file:///C:/Users/me/notes.pdf"), { kind: "pdf", origin: "file://", local: true });
});

test("everything else is an ordinary page", () => {
  assert.equal(classifyUrl("https://example.com/pdf-guide").kind, "page");
  assert.equal(classifyUrl("chrome://extensions").kind, "page");
  assert.equal(classifyUrl("").kind, "page");
});

console.log("transcripts");

test("parses h:mm:ss, mm:ss and m:ss timestamps", () => {
  assert.equal(parseTimestamp("1:02:03"), 3723);
  assert.equal(parseTimestamp("12:34"), 754);
  assert.equal(parseTimestamp("0:07"), 7);
  assert.ok(Number.isNaN(parseTimestamp("abc")));
  assert.ok(Number.isNaN(parseTimestamp("")));
});

test("joins segments and drops sound cues", () => {
  const text = transcriptToText([
    { start: "0:00", text: "[Music]" },
    { start: "0:02", text: "Welcome to" },
    { start: "0:04", text: "the  lecture." },
  ]);
  assert.equal(text, "Welcome to the lecture.");
});

test("starts a new paragraph roughly every 45 seconds", () => {
  const text = transcriptToText([
    { start: "0:00", text: "A" },
    { start: "0:30", text: "B" },
    { start: "0:50", text: "C" },
    { start: "1:40", text: "D" },
  ]);
  assert.equal(text, "A B\n\nC\n\nD");
});

test("tolerates missing timestamps and empty input", () => {
  assert.equal(transcriptToText([{ start: "", text: "one" }, { text: "two" }]), "one two");
  assert.equal(transcriptToText([]), "");
  assert.equal(transcriptToText(undefined), "");
});

console.log("length budget");

test("short text passes through untouched", () => {
  assert.deepEqual(truncateForGeneration("Short."), { text: "Short.", truncated: false, keptPercent: 100 });
});

test("long text is cut at a sentence boundary, under the budget", () => {
  const long = "Sentence one is here. ".repeat(3000);
  const r = truncateForGeneration(long);
  assert.equal(r.truncated, true);
  assert.ok(r.text.length <= MAX_CAPTURE_CHARS);
  assert.ok(r.text.endsWith("."), r.text.slice(-20));
  assert.ok(r.keptPercent > 0 && r.keptPercent < 100);
});

test("falls back to a word boundary, then a hard cut", () => {
  const words = truncateForGeneration("word ".repeat(10000));
  assert.ok(words.text.endsWith("word") && words.text.length <= MAX_CAPTURE_CHARS);
  assert.equal(truncateForGeneration("x".repeat(30000)).text.length, MAX_CAPTURE_CHARS);
});

console.log("long videos: covering the whole thing within the budget");

// A 79-minute lecture as transcriptToText shapes it: one paragraph per ~45s.
const lecture = Array.from({ length: 106 }, (_, i) =>
  `Minute ${i} marker. ` + "The lecturer explains strings and branching in detail here. ".repeat(11)
).join("\n\n");

test("a transcript that fits is used whole", () => {
  const r = sampleForGeneration("Short transcript.");
  assert.equal(r.text, "Short transcript.");
  assert.equal(r.truncated, false);
  assert.equal(r.sampled, false);
});

test("a long transcript stays within the budget", () => {
  assert.ok(lecture.length > MAX_CAPTURE_CHARS * 2, "the fixture must be well over budget");
  const r = sampleForGeneration(lecture);
  assert.ok(r.text.length <= MAX_CAPTURE_CHARS, `${r.text.length} > ${MAX_CAPTURE_CHARS}`);
  assert.equal(r.truncated, true);
  assert.equal(r.sampled, true);
});

test("it draws from the beginning, the middle and the end, not just the start", () => {
  // Cutting from the start covered the first third of a lecture and nothing
  // after it, so every card came from the opening minutes.
  const r = sampleForGeneration(lecture);
  const minutes = [...r.text.matchAll(/Minute (\d+) marker/g)].map((m) => Number(m[1]));
  assert.ok(minutes.includes(0), "the opening");
  assert.ok(minutes.some((m) => m >= 45 && m <= 60), "the middle: " + minutes.join(","));
  assert.ok(minutes.some((m) => m >= 90), "the last stretch: " + minutes.join(","));
});

test("the ending is included, not dropped", () => {
  // Checked on a real 79-minute lecture: evenly spaced starts left the last
  // excerpt ending at minute 69, losing the wrap-up.
  const r = sampleForGeneration(lecture);
  const minutes = [...r.text.matchAll(/Minute (\d+) marker/g)].map((m) => Number(m[1]));
  assert.ok(Math.max(...minutes) >= 104, "the final minutes: got " + Math.max(...minutes));
  assert.ok(lecture.trimEnd().endsWith(r.text.trimEnd().slice(-60)), "the text runs right to the transcript's last words");
});

test("excerpts stay in order and the gaps between them are marked", () => {
  const r = sampleForGeneration(lecture);
  const minutes = [...r.text.matchAll(/Minute (\d+) marker/g)].map((m) => Number(m[1]));
  assert.deepEqual(minutes, [...minutes].sort((a, b) => a - b), "in the order they were said");
  assert.equal(r.text.split("\n\n…\n\n").length, r.excerpts, "one marker between each pair of excerpts");
  assert.ok(r.excerpts >= 2 && r.excerpts <= 8);
});

test("no excerpt ends halfway through a word", () => {
  const r = sampleForGeneration(lecture);
  const known = new Set(lecture.split(/\s+/));
  for (const word of r.text.replace(/…/g, " ").split(/\s+/).filter(Boolean)) {
    assert.ok(known.has(word), `"${word}" is a fragment, not a word from the transcript`);
  }
});

test("a transcript with no paragraph breaks still spans the whole thing", () => {
  const flat = Array.from({ length: 3000 }, (_, i) => `Word${i}.`).join(" ");
  const r = sampleForGeneration(flat);
  assert.ok(r.text.length <= MAX_CAPTURE_CHARS);
  const nums = [...r.text.matchAll(/Word(\d+)\./g)].map((m) => Number(m[1]));
  assert.ok(nums.includes(0) && Math.max(...nums) > 2500, "from the first word to near the last");
});

test("the share it reports is the share it used", () => {
  const r = sampleForGeneration(lecture);
  const actual = Math.floor((r.text.replace(/\n\n…\n\n/g, "").length / lecture.length) * 100);
  assert.ok(Math.abs(r.keptPercent - actual) <= 1, `${r.keptPercent} vs ${actual}`);
});

console.log("labels");

test("a PDF's title comes from its file name", () => {
  assert.equal(pdfTitleFromUrl("https://example.edu/notes/Lecture%203_intro.pdf"), "Lecture 3 intro");
  assert.equal(pdfTitleFromUrl("https://example.edu/"), "PDF document");
  assert.equal(pdfTitleFromUrl("https://example.edu/%E0%A4%A.pdf"), "PDF document");
});

test("the toast note says what was left out", () => {
  assert.equal(captureNote({}), "");
  assert.equal(captureNote({ truncated: true, keptPercent: 40 }), " (used the first 40% of the text)");
  assert.equal(captureNote({ pages: 420, pagesRead: 300 }), " (read 300 of 420 pages)");
  assert.equal(
    captureNote({ pages: 420, pagesRead: 300, truncated: true, keptPercent: 40 }),
    " (read 300 of 420 pages, used the first 40% of the text)"
  );
});

test("a sampled video says the cards cover all of it", () => {
  assert.equal(
    captureNote({ truncated: true, sampled: true, keptPercent: 34 }),
    " (sampled from across the whole video, 34% of the transcript)"
  );
});

console.log("wiring");

test("YouTube samples across the video; PDFs keep their page-order cut", () => {
  const sw = fs.readFileSync(new URL("../src/background/service-worker.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const yt = sw.slice(sw.indexOf("async function captureYouTube"), sw.indexOf("async function capturePdf"));
  assert.ok(yt.includes("sampleForGeneration("), "a long video must be sampled, not cut after its opening");
  assert.ok(/captureNote\(\{[^}]*sampled/.test(yt), "the toast must say it was sampled");
  const pdf = sw.slice(sw.indexOf("async function capturePdf"));
  assert.ok(pdf.slice(0, pdf.indexOf("\n}\n")).includes("truncateForGeneration("), "PDFs are out of scope for this change");
});

console.log(`\n${passed} passed`);
