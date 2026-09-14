# 01 — Make the extension type check pass, and enforce it in CI

**Depends on:** nothing. Do this first: the later prompts add extension code, and
this check protects it.

**Touches:** `tsconfig.json`, new `types/globals.d.ts`,
`src/background/service-worker.js`, `src/content/landing.js`,
`.github/workflows/ci.yml`, and new `tests/tooling.test.mjs`.

## Why

`package.json` has had `"typecheck": "tsc --noEmit"` for a long time, but CI never
runs it, so errors have piled up. At the time of writing, `npm run typecheck`
reports **27 errors**:

- **20 are inside `src/vendor/flatpickr.js`,** a minified third-party file that
  should not be type checked at all.
- **7 are in our own code:**

```
src/background/service-worker.js(223,27): error TS2339: Property 'innerText' does not exist on type 'Element'.
src/background/service-worker.js(254,25): error TS2339: Property 'innerText' does not exist on type 'Element'.
src/content/landing.js(15,7): error TS2740: Type 'Node' is missing the following properties from type 'HTMLElement': ...
src/ui/views/home.js(168,23): error TS2339: Property 'flatpickr' does not exist on type 'Window & typeof globalThis'.
src/ui/views/home.js(169,12): error TS2339: Property 'flatpickr' does not exist on type 'Window & typeof globalThis'.
src/ui/views/home.js(222,23): error TS2339: Property 'flatpickr' does not exist on type 'Window & typeof globalThis'.
src/ui/views/home.js(223,12): error TS2339: Property 'flatpickr' does not exist on type 'Window & typeof globalThis'.
```

Other work may have landed since, so **run `npm run typecheck` first and fix what
it reports now.** Use the fixes below for these errors, and the same approach for
any new ones. Don't silence a real bug with `any`. If an error points at a
genuine bug, fix the bug and say so in your report.

---

## Step 1 — Write the guard test (it should fail)

Create `tests/tooling.test.mjs`:

```js
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
  console.log(`  ✓ ${name}`);
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
```

Run it and confirm it fails:

```bash
node tests/tooling.test.mjs
```

Also run `npm run typecheck` and keep the output for your report.

---

## Step 2 — Make it pass

### 2a. `tsconfig.json`

Keep the existing `compilerOptions` unchanged. Replace the `include` array, and
add `exclude`:

```json
  "include": [
    "src/**/*.js",
    "tools/**/*.mjs",
    "types/**/*.d.ts"
  ],
  "exclude": [
    "src/vendor/**"
  ]
```

### 2b. Create `types/globals.d.ts`

```ts
// Globals defined by vendored scripts. src/vendor/ is excluded from type
// checking (it's minified third-party code), so the parts our code touches are
// declared here. This file lives outside src/ because tools/build.mjs packages
// everything under src/ into the extension.
interface Window {
  flatpickr?: (element: Element | string, options?: Record<string, unknown>) => unknown;
}
```

The file must have no `import` or `export`. That keeps it a global script, so it
extends the built-in `Window` type instead of creating a module.

### 2c. `src/background/service-worker.js`

Both errors are `child.innerText` on a value typed `Element`. In each place `tsc`
reports, change:

```js
const text = (child.innerText || "").trim();
```

to:

```js
const text = ((/** @type {HTMLElement} */ (child)).innerText || "").trim();
```

Only change the lines `tsc` reports.

### 2d. `src/content/landing.js`

Find:

```js
      targetBtn = addBtn.cloneNode(true);
```

Replace with:

```js
      targetBtn = /** @type {HTMLElement} */ (addBtn.cloneNode(true));
```

### 2e. `.github/workflows/ci.yml`

In the **`client-tests`** job, find:

```yaml
  client-tests:
    name: Extension logic tests (node)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
```

Replace with:

```yaml
  client-tests:
    name: Extension logic tests (node)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: package-lock.json
      # typescript + @types/chrome are root devDependencies.
      - run: npm ci
      - name: Type check (extension)
        run: npm run typecheck
```

Leave every other step and job as it is.

---

## Verification

Each of these must pass. Paste the output:

```bash
npm run typecheck
```

`npm run typecheck` must print **0 errors**.

```bash
for f in tests/*.test.mjs; do node "$f" > /dev/null || echo "FAIL $f"; done
```

```bash
node tools/build.mjs
```

Then check that `types/` did not end up in the package:

```bash
node -e "const b=require('fs').readFileSync('dist/firefox/manifest.json');console.log('built ok')" && ls dist/firefox
```

`dist/firefox/` must not contain a `types` folder.

## Report

- The diff of every changed file.
- The `npm run typecheck` output before and after.
- Any error you fixed that turned out to be a real bug.
