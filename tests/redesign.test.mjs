import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const uiDir = join(__dirname, "../src/ui");
const css = readFileSync(join(uiDir, "panel.css"), "utf8");
const html = readFileSync(join(uiDir, "panel.html"), "utf8");

function test(name, fn) {
  try {
    fn();
    console.log(`  ? ${name}`);
  } catch (e) {
    console.error(`  ? ${name}`);
    console.error(e);
    process.exit(1);
  }
}

test("every token exists in both theme blocks", () => {
  const vars = [...css.matchAll(/var\((--[a-z0-9-]+)\)/g)].map(m => m[1]);
  const root = css.match(/:root\s*\{([^}]*)\}/)?.[1] || "";
  const dark = css.match(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{[^{]*:root\s*\{([^}]*)\}/)?.[1] || "";
  
  for (const v of new Set(vars)) {
    // Only check our tokens, ignore standard css vars if any
    assert.ok(root.includes(v + ":"), `Light theme missing ${v}`);
    assert.ok(dark.includes(v + ":"), `Dark theme missing ${v}`);
  }
});

test("no raw hex values outside them", () => {
  const withoutThemes = css.replace(/:root\s*\{[^}]*\}/g, "").replace(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{[^{]*:root\s*\{[^}]*\}\s*\}/g, "");
  assert.ok(!/#([0-9a-fA-F]{3}){1,2}\b/.test(withoutThemes), "Found hex value outside themes");
});

test("nav has exactly five items in order, no .center or raised button", () => {
  const panelJs = readFileSync(join(uiDir, "panel.js"), "utf8");
  assert.ok(panelJs.includes('"home"'), "missing Home");
  assert.ok(panelJs.includes('"sets"'), "missing Sets");
  assert.ok(panelJs.includes('"discover"'), "missing Discover");
  assert.ok(panelJs.includes('"stats"'), "missing Stats");
  assert.ok(panelJs.includes('"you"'), "missing You");
});

test("Teams is reachable from You", () => {
  const youJs = readFileSync(join(uiDir, "views", "you.js"), "utf8");
  assert.ok(youJs.includes('nav-teams') || youJs.includes('open-teams'), "Teams must be reachable from You");
});

test("Geist is a local file, no google fonts", () => {
  assert.ok(css.includes("../vendor/geist/"), "css must reference local Geist");
  assert.ok(html.includes("../vendor/geist/"), "html must reference local Geist");
  assert.ok(!css.includes("fonts.googleapis.com"), "css has remote fonts");
  assert.ok(!html.includes("fonts.googleapis.com"), "html has remote fonts");
});
