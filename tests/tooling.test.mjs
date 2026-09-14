// Tooling guards. Run: node tests/tooling.test.mjs
//
// The type check sat in package.json without CI running it, and quietly rotted
// to 27 errors. These guards keep it wired in.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ? ${name}`);
}

test("CI runs the extension type check", () => {
  assert.ok(
    read(".github/workflows/ci.yml").includes("npm run typecheck"),
    "add `npm run typecheck` to the client-tests job"
  );
});

test("vendored files are excluded from type checking", () => {
  const ts = JSON.parse(read("tsconfig.json"));
  assert.ok((ts.exclude || []).includes("src/vendor/**"), 'tsconfig.json needs "exclude": ["src/vendor/**"]');
});

test("globals defined by vendored scripts are declared in types/", () => {
  const ts = JSON.parse(read("tsconfig.json"));
  assert.ok((ts.include || []).includes("types/**/*.d.ts"), 'tsconfig.json "include" needs "types/**/*.d.ts"');
  assert.ok(existsSync(join(ROOT, "types/globals.d.ts")), "create types/globals.d.ts");
  assert.ok(read("types/globals.d.ts").includes("flatpickr"), "declare window.flatpickr in types/globals.d.ts");
});

test("no declaration files under src/ (tools/build.mjs packages everything in src/)", () => {
  const walk = (dir) =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
  assert.deepEqual(walk(join(ROOT, "src")).filter((p) => p.endsWith(".d.ts")), []);
});

console.log(`\n${passed} passed`);

