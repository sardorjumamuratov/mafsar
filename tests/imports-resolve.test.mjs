// Every named import in the extension must exist in the module it names.
// In a browser a single missing export is a SyntaxError at link time, and the
// whole panel stays blank; none of the other tests load the panel, so none of
// them would notice. (The redesign merge arrived with five of these.)
// Run: node tests/imports-resolve.test.mjs
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return p.includes("vendor") ? [] : walk(p);
    return p.endsWith(".js") ? [p] : [];
  });

const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

function exportsOf(file) {
  const src = read(file);
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function\*?|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  // `export let a = 1, b = [], c = "x";` declares several names: split the
  // declaration on top-level commas.
  for (const m of src.matchAll(/export\s+(?:const|let|var)\s+/g)) {
    let depth = 0, i = m.index + m[0].length, part = "", parts = [], lastSig = "";
    for (; i < src.length; i++) {
      const ch = src[i];
      if ("([{".includes(ch)) depth++;
      else if (")]}".includes(ch)) depth--;
      // A newline ends the statement unless the line ended in "," or "=".
      if (depth === 0 && (ch === ";" || (ch === "\n" && lastSig !== "," && lastSig !== "="))) break;
      if (!/\s/.test(ch)) lastSig = ch;
      if (depth === 0 && ch === ",") { parts.push(part); part = ""; continue; }
      part += ch;
    }
    parts.push(part);
    for (const p of parts) {
      const id = p.trim().match(/^([A-Za-z_$][\w$]*)/);
      if (id) names.add(id[1]);
    }
  }
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(",")) {
      const t = part.trim();
      if (!t) continue;
      const as = t.split(/\s+as\s+/);
      names.add((as[1] || as[0]).trim());
    }
  }
  return names;
}

const problems = [];
const files = [...walk(join(root, "src")), ...walk(join(root, "shared"))];
for (const file of files) {
  const src = read(file);
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
    const spec = m[2];
    if (!spec.startsWith(".")) continue;
    const target = resolve(dirname(file), spec);
    const rel = file.slice(root.length + 1).replace(/\\/g, "/");
    if (!existsSync(target)) {
      problems.push(`${rel} imports from ${spec}, which doesn't exist`);
      continue;
    }
    const have = exportsOf(target);
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (name && !have.has(name)) problems.push(`${rel} imports { ${name} } from ${spec}, which doesn't export it`);
    }
  }
}

assert.deepEqual(problems, [], "\n" + problems.join("\n"));
console.log(`  ✓ every named import resolves (${files.length} files)`);
