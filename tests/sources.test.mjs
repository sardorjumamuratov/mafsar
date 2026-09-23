// What "Capture this page" is looking at, and how extracted text is shaped.
// Run: node tests/sources.test.mjs
import assert from "node:assert/strict";
import {
  MAX_CAPTURE_CHARS, captureNote, classifyUrl, parseTimestamp,
  pdfTitleFromUrl, transcriptToText, truncateForGeneration,
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

console.log(`\n${passed} passed`);
