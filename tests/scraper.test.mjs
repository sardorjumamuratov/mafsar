import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class FakeDocument {
  constructor(html) {
    this.html = html;
  }
  
  querySelectorAll(selector) {
    if (selector.includes("ms-chat-turn") || selector.includes("[class*='chat-turn']")) {
      const matches = [...this.html.matchAll(/<ms-chat-turn[^>]*>([\s\S]*?)<\/ms-chat-turn>/g)];
      return matches.map(m => new FakeElement(m[0]));
    }
    if (selector.includes("ytd-transcript-segment-renderer")) {
      const matches = [...this.html.matchAll(/<ytd-transcript-segment-renderer[^>]*>([\s\S]*?)<\/ytd-transcript-segment-renderer>/g)];
      return matches.map(m => new FakeElement(m[0]));
    }
    if (selector.includes("ytd-transcript-segment-list-renderer > div")) {
      return []; // Fallback not in mock
    }
    if (selector.includes("[data-turn-role=")) {
      return []; // Fallback not in mock
    }
    return [];
  }
  
  querySelector(selector) {
    if (selector === "h1.ytd-watch-metadata") {
      const m = this.html.match(/<h1[^>]*ytd-watch-metadata[^>]*>([^<]*)<\/h1>/);
      if (m) return new FakeElement(m[0], m[1]);
    }
    if (selector.includes("#description-inline-expander #expand") || selector.includes('button[aria-label="Expand"]')) {
      const m = this.html.match(/<button[^>]*id="expand"[^>]*>([^<]*)<\/button>/);
      if (m) {
        const el = new FakeElement(m[0], m[1]);
        el.click = () => { this._expandClicked = true; };
        return el;
      }
    }
    if (selector.includes("ytd-video-description-transcript-section-renderer button") || selector.includes('button[aria-label="Show transcript"]')) {
      const m = this.html.match(/<button[^>]*aria-label="Show transcript"[^>]*>([^<]*)<\/button>/);
      if (m) {
        const el = new FakeElement(m[0], m[1]);
        el.click = () => { this._transcriptClicked = true; };
        return el;
      }
    }
    return null;
  }
}

class FakeElement {
  constructor(html, textContent = "") {
    this.html = html;
    this._textContent = textContent;
  }
  get textContent() {
    if (this._textContent) return this._textContent;
    return this.html.replace(/<[^>]+>/g, "").trim();
  }
  querySelector(selector) {
    if (selector.includes(".segment-timestamp") || selector.includes("[class*='timestamp']")) {
      const m = this.html.match(/<div[^>]*segment-timestamp[^>]*>([^<]*)<\/div>/);
      if (m) return new FakeElement(m[0], m[1]);
    }
    if (selector.includes(".segment-text") || selector.includes("[class*='text']")) {
      const m = this.html.match(/<div[^>]*segment-text[^>]*>([^<]*)<\/div>/);
      if (m) return new FakeElement(m[0], m[1]);
    }
    if (selector.includes('[data-turn-role="User"]') || selector.includes('[class*="user"]')) {
      if (this.html.includes('data-turn-role="User"')) return new FakeElement("<div></div>");
    }
    if (selector.includes('[data-turn-role="Model"]') || selector.includes('[class*="model"]')) {
      if (this.html.includes('data-turn-role="Model"')) return new FakeElement("<div></div>");
    }
    return null;
  }
  getAttribute(name) {
    const match = this.html.match(new RegExp(`${name}="([^"]*)"`));
    return match ? match[1] : null;
  }
}

const swSource = fs.readFileSync(path.join(__dirname, "../src/background/service-worker.js"), "utf8");
const match = swSource.match(/async function extractYouTubeTranscript\(\) \{([\s\S]*?)return \{ ok: true, title, segments \};\s*\}/);
const extractFn = new Function(`
  ${match[0]}
  return extractYouTubeTranscript();
`);

const aistudioSource = fs.readFileSync(path.join(__dirname, "../src/content/adapters/aistudio.js"), "utf8");
const startIdx = aistudioSource.indexOf("getMessages() {");
const endIdx = aistudioSource.lastIndexOf("return out;");
const aiFunc = aistudioSource.slice(startIdx, endIdx) + "return out;\n}";

const getMessagesFn = new Function(`
  const window = { __mafsar: { readText: (el) => el.textContent.trim() } };
  const obj = {
    ${aiFunc}
  };
  return obj.getMessages();
`);

async function run() {
  await testYouTubeOpen();
  await testYouTubeCollapsed();
  await testYouTubeNone();
  testAIStudio();
}
run();

async function testYouTubeOpen() {
  const html = fs.readFileSync(path.join(__dirname, "fixtures/youtube_open.html"), "utf8");
  global.document = new FakeDocument(html);
  
  const result = await extractFn();
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.title, "Test Video");
  assert.strictEqual(result.segments.length, 2);
  assert.strictEqual(result.segments[0].text, "Hello world");
  console.log("✔ YouTube open transcript works");
}

async function testYouTubeCollapsed() {
  const html = fs.readFileSync(path.join(__dirname, "fixtures/youtube_collapsed.html"), "utf8");
  global.document = new FakeDocument(html);
  
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (fn) => fn();
  
  const resultPromise = extractFn();
  
  Promise.resolve().then(() => {
    if (global.document._transcriptClicked) {
      global.document.html += "<ytd-transcript-segment-renderer><div class='segment-timestamp'>0:00</div><div class='segment-text'>Loaded text</div></ytd-transcript-segment-renderer>";
    }
  });
  
  const result = await resultPromise;
  global.setTimeout = originalSetTimeout;
  
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.segments[0].text, "Loaded text");
  console.log("✔ YouTube collapsed transcript clicks and waits");
}

async function testYouTubeNone() {
  const html = fs.readFileSync(path.join(__dirname, "fixtures/youtube_none.html"), "utf8");
  global.document = new FakeDocument(html);
  
  const result = await extractFn();
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, "no-transcript");
  console.log("✔ YouTube no transcript returns honest failure");
}

function testAIStudio() {
  const html = fs.readFileSync(path.join(__dirname, "fixtures/aistudio.html"), "utf8");
  global.document = new FakeDocument(html);
  
  const msgs = getMessagesFn();
  assert.strictEqual(msgs.length, 2);
  assert.strictEqual(msgs[0].role, "user");
  assert.strictEqual(msgs[0].text, "What is 2+2?");
  console.log("✔ AI Studio extraction works");
}
