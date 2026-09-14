# 04 — Make the store listing, privacy policy and panel copy accurate

**Depends on:** nothing. Safe to run alongside any other task, except that it
edits `server/src/privacy.ts` (see the README).

**Touches:** `docs/store-listing.md`, `server/src/privacy.ts`,
`src/ui/views/you.js`, `src/ui/views/teams.js`, `src/config.js`, and new tests
`server/tests/privacy.test.ts` and `tests/listing-accuracy.test.mjs`.

## Why

Several texts describe a product Mafsar no longer is. Both extension stores
require descriptions to be accurate.

- **An account is required.** `src/ui/panel.js` shows the sign-in screen and
  nothing else until the user signs in. But:
  - `docs/store-listing.md` says "Works offline; sign in to sync across devices."
  - `server/src/privacy.ts` says Mafsar "works fully offline" and that an account
    is "only needed if…".
  - Panel copy in `you.js` and `teams.js` promises account-free use.
- **The AI provider list is out of date.** The privacy policy names "Google
  Gemini, Groq, or Anthropic". Production generation now goes through
  **OpenRouter**.
- **Reviewer credentials are committed.** `docs/store-listing.md` contains a
  store-reviewer test account's email and password, and the repo is public.
- **The build note overstates.** It says "no minifier… is used" and that all
  JavaScript is byte-identical to source. But `src/vendor/flatpickr.js` is a
  minified third-party build.

---

## Step 1 — Write the tests (they should fail)

### 1a. Create `server/tests/privacy.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { PRIVACY_HTML } from "../src/privacy.js";

// The policy must describe what the product actually does. Whitespace is
// collapsed so line wrapping in the source can't hide a phrase.
const text = PRIVACY_HTML.replace(/\s+/g, " ");

describe("privacy policy", () => {
  it("does not claim Mafsar works without an account", () => {
    expect(text).not.toMatch(/works fully offline/i);
    expect(text).not.toMatch(/only needed if/i);
    expect(text).not.toMatch(/never create an account/i);
    expect(text).toMatch(/requires a free account/i);
  });

  it("names the AI service production actually uses", () => {
    expect(text).toContain("OpenRouter");
    expect(text).not.toContain("Groq");
  });
});
```

### 1b. Create `tests/listing-accuracy.test.mjs`

```js
// Store listing and panel copy must match the product. Run: node tests/listing-accuracy.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("the store listing doesn't claim offline use", () => {
  const md = read("docs/store-listing.md");
  assert.ok(!/works offline/i.test(md), "an account is required: see src/ui/panel.js");
  assert.ok(/account required/i.test(md), "say plainly that a free account is required");
});

test("the store listing contains no credentials", () => {
  const md = read("docs/store-listing.md");
  assert.ok(!/^\s*Password:\s*\S/m.test(md), "reviewer passwords go in the store's private reviewer-notes field, never in the repo");
  assert.ok(!/^\s*Email:\s*\S+@/m.test(md), "no reviewer test-account email in the repo either");
});

test("the build note discloses the vendored minified file", () => {
  assert.ok(read("docs/store-listing.md").includes("flatpickr"), "mention src/vendor/flatpickr.js in the build note");
});

test("panel copy doesn't promise account-free use", () => {
  for (const f of ["src/ui/views/you.js", "src/ui/views/teams.js"]) {
    const s = read(f);
    for (const phrase of ["works offline without an account", "keeps working offline", "Everything stays on this device"]) {
      assert.ok(!s.includes(phrase), `${f} still says "${phrase}"`);
    }
  }
});

console.log(`\n${passed} passed`);
```

Run both and confirm they fail:

```bash
cd server && npx vitest run tests/privacy.test.ts
```

```bash
node tests/listing-accuracy.test.mjs
```

---

## Step 2 — Fix the text

These are prose edits. The files use CRLF line endings, so match the text rather
than exact line breaks.

### 2a. `docs/store-listing.md`

**Description bullet.** Replace the bullet `- Works offline; sign in to sync across devices.` with:

```
- Free account required: generation runs on our servers, and your sets sync
  across your devices.
```

**Reviewer credentials.** In the "Notes to Reviewer" block, find the three
lines that start with `Test account`, `Email:` and `Password:`. Replace all three
with:

```
Test account: supplied privately in the store's reviewer-notes field
(credentials are never committed to this repository).
```

**Build note.** It currently begins "Build note: no minifier, bundler, or
transpiler is used. All JavaScript in this package is byte-identical to the
public source at …". Replace those two sentences with:

```
Build note: no minifier, bundler, or transpiler is used on our code. Every file
in this package is byte-identical to the public source at
https://github.com/sardorjumamuratov/mafsar, with one exception:
src/vendor/flatpickr.js is the unmodified, published build of flatpickr 4.6.13
(MIT, https://github.com/flatpickr/flatpickr).
```

Leave the rest of the file as it is.

### 2b. `server/src/privacy.ts`

**Account paragraph.** Replace the paragraph that begins "By default, Mafsar
works fully offline" with:

```html
<p>Mafsar requires a free account. Flashcard and quiz generation run on our
servers, and your study data syncs to your account so it's available on your
other devices. A copy is also kept in your browser's local storage so reviews
stay fast.</p>
```

**AI provider sentence.** In the paragraph under "How captured text is
processed", replace the part from "a third-party AI model provider (currently
Google Gemini, Groq, or Anthropic, depending on server configuration)" to the
end of the paragraph with:

```html
a third-party AI service (currently OpenRouter, which passes the request to the
underlying model provider, such as Google) solely to generate study material. We
configure that service not to allow your text to be used for model training, and
we do not share it for advertising or analytics.</p>
```

**Storage paragraph.** Under "Where data is stored", delete the last sentence:
"If you never create an account, your data stays only in your browser's local
storage and is never sent to us."

**Date.** Set "Last updated" to today's date, in the same format.

Change nothing else in `privacy.ts`. Other prompts add their own sections to it.

### 2c. `src/ui/views/you.js`

- Replace `Sign in to sync your sets across devices. Everything works offline without an account.` with `Sign in to generate study sets and sync them across your devices.`
- Replace `"Everything stays on this device"` with `"Sign in to back up your sets"`.

### 2d. `src/ui/views/teams.js`

In the signed-out Teams message, delete the sentence
` Everything else keeps working offline.`, including its leading space. Keep the
sentence before it.

### 2e. `src/config.js`

The first comment line says the extension "works fully offline without an
account". Change it to say an account is required, because `src/ui/panel.js`
gates on sign-in. Only the comment changes; no code.

---

## Verification

```bash
cd server && npx vitest run && npx tsc --noEmit
```

```bash
for f in tests/*.test.mjs; do node "$f" > /dev/null || echo "FAIL $f"; done
```

## Report

- Diffs, and the test output (failing first, then passing).
- Confirm you didn't add any credential anywhere, including in the report.

---

## For the owner

1. **Change the store-reviewer account's password now.** Removing it from the
   file doesn't remove it from git history, and the repo is public. Put the new
   credentials only in each store's private reviewer-notes field.
2. **Update the live listings.** `docs/store-listing.md` is only a copy. Edit the
   description on addons.mozilla.org (and the Chrome Web Store, when published) so
   it no longer says "Works offline".
3. **Make the new privacy claim true.** The policy now says your AI service
   isn't allowed to train on user text. In OpenRouter's privacy settings, turn off
   providers that may train on or retain your inputs. Do this before deploying the
   new policy.
