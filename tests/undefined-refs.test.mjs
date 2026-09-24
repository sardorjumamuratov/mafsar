// Calling something you forgot to import is a ReferenceError at run time, in a
// view, with nothing to catch it: every other test here is static, and the one
// time it happened the whole panel rendered blank.
//
// This walks each module, collects every name it declares or imports, and flags
// a call to a name that is neither. Regex-shaped, so it is deliberately
// conservative — it only looks at call position, and anything preceded by a dot
// is a property, not a free identifier.
// Run: node tests/undefined-refs.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const here = import.meta.dirname;

function walkJs(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkJs(full));
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

// Things the platform provides. Not exhaustive by design: an unknown name that
// turns out to be a global gets added here, deliberately, once.
const GLOBALS = new Set([
  "chrome", "browser", "window", "document", "console", "fetch", "structuredClone",
  "setTimeout", "clearTimeout", "setInterval", "clearInterval", "queueMicrotask",
  "Promise", "Array", "Object", "String", "Number", "Boolean", "Math", "JSON", "Date",
  "Set", "Map", "WeakMap", "WeakSet", "Error", "TypeError", "RangeError", "RegExp",
  "Symbol", "BigInt", "Proxy", "Reflect", "Intl", "URL", "URLSearchParams", "Blob",
  "File", "FileReader", "FormData", "Headers", "Request", "Response", "AbortController",
  "AbortSignal", "TextEncoder", "TextDecoder", "CustomEvent", "Event", "EventTarget",
  "DOMParser", "XMLSerializer", "Node", "Element", "HTMLElement", "CSS", "Image",
  "localStorage", "sessionStorage", "navigator", "location", "history", "screen",
  "alert", "confirm", "prompt", "atob", "btoa", "crypto", "performance", "self",
  "globalThis", "isNaN", "isFinite", "parseInt", "parseFloat", "encodeURIComponent",
  "decodeURIComponent", "encodeURI", "decodeURI", "requestAnimationFrame", "flatpickr",
  "Uint8Array", "ArrayBuffer", "DataView", "Intl", "IntersectionObserver", "MutationObserver",
  // Control-flow keywords that can be followed by "(" and would look like calls.
  "if", "for", "while", "switch", "catch", "return", "typeof", "await", "function",
  "else", "do", "new", "delete", "void", "in", "of", "case", "yield", "import", "async", "var",
]);

/** Every name the file brings into scope: imports, declarations, parameters. */
function declaredNames(src) {
  const names = new Set();
  const add = (n) => n && names.add(n);

  // import { a, b as c } from "..."  /  import d from "..."  /  import * as e
  for (const m of src.matchAll(/import\s+([^;]*?)\s+from\s+["']/g)) {
    const clause = m[1];
    for (const part of clause.replace(/[{}]/g, " ").split(",")) {
      const bits = part.trim().split(/\s+as\s+/);
      add(bits[bits.length - 1].replace(/^\*\s*/, "").trim());
    }
  }
  // declarations, including destructuring targets
  for (const m of src.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) add(m[1]);
  for (const m of src.matchAll(/\b(?:function|class)\s+([A-Za-z_$][\w$]*)/g)) add(m[1]);
  for (const m of src.matchAll(/\b(?:const|let|var)\s*[{[]([^}\]]*)[}\]]/g)) {
    for (const part of m[1].split(",")) {
      const bits = part.trim().split(/[:=]/);
      add(bits[bits.length > 1 ? 1 : 0].trim().replace(/^\.\.\./, ""));
    }
  }
  // parameters: (a, b = 1, { c }) => and function f(a, b)
  for (const m of src.matchAll(/(?:function\s*[\w$]*\s*)?\(((?:[^()]|\([^()]*\))*)\)\s*(?:=>|\{)/g)) {
    for (const part of m[1].replace(/[{}[\]]/g, " ").split(",")) {
      const bits = part.trim().split(/[:=]/);
      add(bits[0].trim().replace(/^\.\.\./, ""));
    }
  }
  for (const m of src.matchAll(/([A-Za-z_$][\w$]*)\s*=>/g)) add(m[1]);
  // catch (e)
  for (const m of src.matchAll(/catch\s*\(\s*([A-Za-z_$][\w$]*)/g)) add(m[1]);
  // labelled object properties that are function shorthand: { foo() {} }
  for (const m of src.matchAll(/([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g)) add(m[1]);
  return names;
}

/**
 * Blank out everything that isn't code, keeping newlines so line numbers hold.
 * A scanner, not a regex: markup lives in nested template literals here, and
 * regex literals are full of things that look like calls — /req(uest)?s?/.
 */
function stripNonCode(src) {
  let out = "";
  let i = 0;
  let prev = ""; // last significant code character, for telling regex from divide
  const templates = []; // brace depth at each open template, for ${ } nesting
  let braceDepth = 0;
  const keep = (ch) => (ch === "\n" ? "\n" : " ");

  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];

    if (templates.length && braceDepth === templates[templates.length - 1]) {
      // Inside a template's text: only ${ returns us to code, and ` ends it.
      if (ch === "\\") { out += keep(ch); i++; if (i < src.length) out += keep(src[i++]); continue; }
      if (ch === "`") { templates.pop(); out += " "; i++; prev = '"'; continue; }
      if (ch === "$" && next === "{") { braceDepth++; out += "  "; i += 2; continue; }
      out += keep(ch);
      i++;
      continue;
    }

    if (ch === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") out += keep(src[i++]);
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      while (i < stop) out += keep(src[i++]);
      continue;
    }
    if (ch === '"' || ch === "'") {
      out += " ";
      i++;
      while (i < src.length && src[i] !== ch) {
        if (src[i] === "\\") { out += keep(src[i]); i++; }
        if (i < src.length) out += keep(src[i++]);
      }
      out += " ";
      i++;
      prev = '"';
      continue;
    }
    if (ch === "`") {
      templates.push(braceDepth);
      out += " ";
      i++;
      continue;
    }
    if (ch === "/" && /[(,=:[!&|?{};+\-*%<>~^]|^$/.test(prev)) {
      // A regex literal, not division.
      out += " ";
      i++;
      let inClass = false;
      while (i < src.length) {
        const c = src[i];
        if (c === "\\") { out += keep(c); i++; if (i < src.length) out += keep(src[i++]); continue; }
        if (c === "[") inClass = true;
        else if (c === "]") inClass = false;
        else if (c === "/" && !inClass) break;
        else if (c === "\n") break;
        out += keep(c);
        i++;
      }
      out += " ";
      i++;
      while (i < src.length && /[a-z]/.test(src[i])) { out += " "; i++; }
      prev = ")";
      continue;
    }
    if (ch === "{") braceDepth++;
    if (ch === "}") {
      braceDepth--;
      if (templates.length && braceDepth === templates[templates.length - 1]) {
        out += " ";
        i++;
        continue; // back into template text
      }
    }
    out += ch;
    if (!/\s/.test(ch)) prev = ch;
    i++;
  }
  return out;
}

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

test("every function a module calls is one it imported or declared", () => {
  const problems = [];
  for (const dir of ["../src/ui/", "../src/storage/", "../src/sync/", "../src/background/"]) {
    for (const file of walkJs(path.join(here, dir))) {
      const raw = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
      const declared = declaredNames(raw);
      const code = stripNonCode(raw);
      for (const m of code.matchAll(/(^|[^\w$.?])([A-Za-z_$][\w$]*)\s*\(/g)) {
        const name = m[2];
        if (declared.has(name) || GLOBALS.has(name)) continue;
        const line = code.slice(0, m.index).split("\n").length;
        problems.push(`${path.relative(path.join(here, ".."), file).replace(/\\/g, "/")}:${line} calls ${name}(), which is never imported or declared`);
      }
    }
  }
  assert.deepEqual(problems, [], "\n" + problems.join("\n"));
});

console.log(`\n${passed} passed`);
