# Redesign prompts: Home, Sets, Set detail, Discover, Stats

Thirteen prompts plus one added prompt (13), run one at a time, in order. Each
turns part of the new design into working Mafsar code, **pixel-exact**.

**Supersedes prompts 32 to 37.** Don't run 37. Whatever 32 to 36 already landed
(inline edit, capture dock, categories, Global library, ratings) is the
starting point. These prompts restyle it and extend it to the final design.
They never build a second copy next to it (see rule 11).

## Before the first prompt: put the design in the repo

The agent can only match what it can read. Copy the design exports into the
repo, exactly as exported and unedited:

```
docs/design/App Screens.dc.html
docs/design/Set Detail Redesign.dc.html
docs/design/reference/01-home.html
docs/design/reference/02-sets.html
docs/design/reference/03-set-detail.html
docs/design/reference/04-discover.html
docs/design/reference/05-stats.html
docs/design/reference/logic.js
```

**Precedence:** `App Screens.dc.html` beats `Set Detail Redesign.dc.html`.
For visual values, the reference files beat the prose. For behaviour, the
prose beats the reference.

## Run order

| Step | Prompt | Depends on | Kind |
|---|---|---|---|
| 1 | [00 Foundation: tokens, font, shared components, nav](00-foundation.md) | — | UI |
| 2 | [01 Home](01-home.md) | 00 | UI + small data |
| 3 | [02 Sets](02-sets.md) | 00 | UI + small data + server |
| 4 | [03 Set detail](03-set-detail.md) | 00, 02 | UI + small server |
| 5 | [13 Everything else gets the new look](13-restyle-remaining.md) | 00 | UI |
| 6 | [04 QA: the first three screens](04-qa-screens.md) | 01, 02, 03, 13 | QA |
| 7 | [05 Capture dock](05-capture-dock.md) | 00 | UI |
| 8 | [06 Edit cards in place](06-inline-edit.md) | 03 | UI |
| 9 | [07 Star ratings, synced](07-ratings.md) | 03 | UI + server + sync |
| 10 | [08 AI category per set (server only)](08-categories.md) | — | server |
| 11 | [09 Make it global + Discover](09-global-discover.md) | 07, 08 | UI + server + sync |
| 12 | [10 Stats and feedback](10-stats.md) | 00 | UI + server |
| 13 | [11 QA: round 3](11-qa-round3.md) | 05–10 | QA |
| 14 | [12 Pixel parity](12-pixel-parity.md) | everything | QA |

**Merge each one before starting the next.** 02, 07, 08, 09 and 10 each add a
migration, and so do the unmerged `feat/usage-counts` (slot 017) and any of
32–36 that haven't merged yet. Run them one at a time, and append each
migration at the end of whatever `main` has when you start.

## How to hand one to Gemini

```
Implement docs/prompts/redesign/NN-name.md. First read docs/prompts/redesign/README.md and AGENTS.md, and the reference files the prompt lists. Pixel-exact: match the reference 1:1.
```

---

## Rules for every redesign prompt

Each prompt refers back to these. They cover what the original design
document left out, because it was written for a generic phone app and Mafsar
is a browser extension.

### 1. Pixel-exact

> The reference HTML is the pixel-exact design at a 390 × 884 viewport. Match
> every inline style value 1:1: size, colour, radius, padding, margin, gap,
> border, font size, weight, line-height, letter-spacing, icon path and stroke
> width. Don't round values, substitute theme tokens with different values, or
> "improve" spacing. Where the prose and the reference disagree on a visual
> value, the reference wins. Where they disagree on behaviour, the prose wins.

- **Take icon paths from the reference.** Copy them character for character.
  Never substitute an icon library or draw your own. Put every icon in one
  module, `src/ui/icons.js`, as static SVG strings with no interpolated
  values, so they pass through `setHTML` unchanged.
- **Values the prose gives but the reference doesn't show** (hover, focus,
  disabled and open states, animations): use the prose.
- **Where neither says anything,** use the existing shared components and
  tokens. Never invent a new colour, radius or size. List every such choice in
  your report.

### 2. It's a browser extension, not a phone app

| The design says | In Mafsar that means |
|---|---|
| 390 × 884 screen | The side panel is fluid: about 320–480 px wide, any height. Fixed sizes (buttons, tiles, radii, type) stay exact, and widths flex. Check parity at 390 × 884. It must also work at 320 px (nothing overflows or clips) and in the Firefox sidebar. |
| Full-screen app | **Tab mode** (prompt 23, "Open Mafsar in a tab"): the whole app, including the dock, nav, sheets and toast, sits in one centred column, `max-width: 480px`, with `--bg-app` filling the rest of the page. |
| System back gesture | **Esc** closes the top sheet, menu or editor. The Back icon button goes back. |
| "App returns to the foreground" | `document.visibilitychange` to visible, and the panel opening. |
| "App restart" | Closing and reopening the panel, or the browser. Persist to `chrome.storage.local` through `src/storage/store.js`, which already partitions by account, never `localStorage`. |
| On-screen keyboard open | Doesn't exist on desktop. Ignore that condition. |
| Touch-only device | `@media (hover: none) and (pointer: coarse)`. |
| ⌘ versus Ctrl | Mac is detected with `navigator.userAgentData?.platform \|\| navigator.platform`. |
| `/sets/{id}/…`, `/discover`, `/feedback` | Routes live under **`/v1/`** in `server/src/app.ts`, behind the existing auth middleware, zod schemas (`schema.ts`) and rate limits (`ratelimit.ts`). |
| "DB trigger", "background queue", "nightly job" | libSQL/Turso behind a single Railway process. Use transactions (`db.batch([...], "write")`), and in-process timers started in `server/src/index.ts`. State lives in the database (e.g. `categorised_at IS NULL`), so a restart loses nothing. |
| Mobile app | Out of scope for the UI. But any change to `/v1/sync` must round-trip through `mobile/` without losing fields: `cd mobile && npm run typecheck && npm test`. |

### 3. The font is bundled, never fetched

Geist is **not** loaded from Google Fonts. A remote font is a third-party
request from every user (hard rule 8), fails offline, and draws store-review
questions. Instead:

- Put the official variable font (`Geist[wght].woff2` from the Vercel
  `geist-font` release, SIL OFL) and its licence text in `src/vendor/geist/`,
  unmodified. The variable font is what gives weight 650.
- Add `@font-face { font-family: "Geist"; src: url("../vendor/geist/…") format("woff2"); font-weight: 100 900; font-display: block; }`,
  and a `<link rel="preload" as="font" type="font/woff2" crossorigin>` in
  `panel.html`, so the first paint is already Geist.
- Stack: `"Geist", system-ui, sans-serif`. `manifest.json` doesn't change,
  since extension pages can load their own files.
- Check that `tools/build.mjs` ships `src/vendor/geist/` in both zips.

### 4. Tokens are CSS custom properties, in two themes

- Every token becomes a CSS variable on `:root` in `src/ui/panel.css`: a
  dotted name becomes kebab-case (`bg.app` → `--bg-app`, `text.primary` →
  `--text-primary`, `status.newBar` → `--status-new-bar`, AI Studio's tile →
  `--src-ai-bg` / `--src-ai-fg`). Components use only variables. The only hex
  values in the whole stylesheet are inside the two token blocks.
- **The dark values in 00 are the reference.** The panel currently follows the
  system theme (`color-scheme: light dark`), and light-mode users must not get
  a broken screen. The design has no light mock, so use the **derived light
  palette** below: the same structure and relationships, tuned for contrast.
  Dark is used under `@media (prefers-color-scheme: dark)`, light otherwise.
  Pixel parity is checked in dark.

  | Token | Light value | | Token | Light value |
  |---|---|---|---|---|
  | bg.app | #f5f8f7 | | text.faint | #6f7f7b |
  | bg.nav | #ffffff | | accent | #34bcad |
  | bg.surface | #ffffff | | accent.hover | #2fae9f |
  | bg.surface2 | #edf2f0 | | accent.on | #04211d |
  | bg.sheet | #ffffff | | accent.text | #11766b |
  | bg.segmentActive | #e2eae7 | | accent.dot | #1f9d8f |
  | border.control | #d3ddd9 | | accent.chipBg | #daf3ef |
  | border.card | #dfe7e4 | | accent.onWhite | #16786e |
  | border.divider | #e6ecea | | status.new | #8a9894 |
  | border.hover | #8fcac2 | | status.newBar | #cfd8d5 |
  | text.primary | #0e1513 | | status.learning | #e3a246 |
  | text.secondary | #26332f | | status.learningText | #a8660d |
  | text.answer | #3a4845 | | status.mastered | #2f9e63 |
  | text.body2 | #4b5a56 | | danger.text | #c2412f |
  | text.muted | #5b6b67 | | overlay | rgba(14,21,19,0.45) |
  | toast.bg | #0e1513 | | toast.text | #e7eeec |
  | toast action | #5fd3c5 | | rating.star | #e9b93a |
  | rating.empty | #a3b0ac | | chart.bar | #cfe3df |
  | chart.zero | #e6ecea | | | |

  Light source tiles (bg / fg): AI `#daf3ef / #11766b`, YT `#fbe3df / #b3402e`,
  GPT `#e9efed / #26332f`, Q `#e3e9fb / #3552b0`.

  One extra token exists in both themes: **`status.learningText`**, for amber
  *text* such as due counts. In dark it equals `status.learning` (#e3a246). In
  light it's the darker #a8660d, because #e3a246 on white fails contrast. Amber
  dots and bars always use `status.learning`.
- **Things the design didn't specify, used everywhere:**
  - Focus: `:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 2px; }`, never removed without a replacement.
  - Scrollbars: `scrollbar-width: thin; scrollbar-color: var(--border-control) transparent`.
  - Text selection: the default.

### 5. Markup, code and hard rules

- Vanilla ES modules, no framework, no bundler, no npm dependencies for the
  extension (hard rule 2).
- All markup goes through `setHTML` / `replaceHTML` / `insertHTMLBefore` in
  `src/ui/core.js`, and every interpolated value through `esc()` (hard rule
  1). No `innerHTML` anywhere in `src/`.
- Messages to tabs have timeouts (rule 4). Migrations are append-only (rule 5).
  Manifest permissions don't change (rule 6). Model failures raise `LLMError`
  (rule 9).
- **Build shared pieces once:** `src/ui/sheet.js` (BottomSheet), the toast in
  `core.js`, `src/ui/icons.js`, and one `setRowHtml()` used by Home, Sets and
  anywhere else a set row appears.

### 6. Local-first stays

Views paint from local storage first, and the network comes after. Slots that
wait on the network show layout-neutral skeletons that respect reduced motion.
A background sync repaints only when it's safe (prompt 31: never over a focus
view, an open sheet or menu, or half-typed input). `tests/ui-static.test.mjs`
enforces all of this. Keep it green.

### 7. Sheets, menus and toasts behave the same everywhere

- **BottomSheet:** `role="dialog"`, `aria-modal="true"`, `aria-labelledby`
  pointing at the title (or `aria-label` when there's no title). Focus moves
  into it and is trapped there. Esc or an overlay tap closes it, and focus
  returns to the element that opened it. If the reference has no animation:
  open with the panel `translateY(100%) → 0` over 220ms
  `cubic-bezier(.2,.8,.2,1)` and the overlay fading in over 150ms; close in
  reverse over 160ms; reduced motion → fade only. The body doesn't scroll
  behind it. Replace `src/ui/confirm.js`'s sheet with this component, keeping
  `confirmSheet()`'s API.
- **Toast:** the existing `#toast` element, now with an optional action
  button, `role="status"` and `aria-live="polite"`. A new toast replaces the
  current one.
- **Undo:** anything with Undo writes nothing until the toast expires. Also
  commit it on `pagehide`, so closing the panel during the 4 seconds still
  deletes. An undone action writes nothing at all.

### 8. Data and sync

- **A new field on a set or card** needs all of these: a migration (appended,
  fingerprint added to `server/tests/migrations.test.ts`, count bumped in
  `schema.test.ts`); the zod schema; `server/src/sync.ts` in both directions,
  with the `COALESCE`-style guard so an old client can't blank it;
  `shared/sync-map.js` in both directions; and a mobile round-trip test.
- **Device-only state** (last opened, UI choices such as sort or study mode)
  lives in `store.js` under the account partition and doesn't sync, unless the
  prompt says it does.
- **Anything the server computes** (rating average and count, `isGlobal`, the
  Discover ranking) is read-only on the client. The sync schema rejects a
  client that tries to push it.

### 9. Titles

Wherever a set title is displayed, it goes through `cleanTitle()` (prompt 02),
so no screen ever shows "User 9:59 AM …".

### 10. Tests

Test first, as `AGENTS.md` says. The redesign deliberately changes things
existing tests pin, such as button ids, layout strings and the old nav. When a
test pins the *old design*, rewrite it to pin the new one, and say which ones
and why in your report. Never delete or weaken a *safety* test: no
`innerHTML`, permission request before `await`, message timeouts, local-first
paint, layout-neutral skeletons, repaint safety, migration fingerprints.

### 11. Build on what's already there

Prompts 32–36 may already have landed. Look before building:

- Inline edit (32), the capture dock (33), `sets.category` (34), the Global
  library and its `/v1/global/*` routes (35), and ratings (36).
- **Reuse** their tables, routes, sync fields and modules, and restyle and
  extend them to this spec. Where this spec's data model differs, move
  forward with a new appended migration and a backfill. Never edit an old
  migration or leave two systems doing one job. Say what you reused and what
  you migrated.

### 12. Verify, then report

```bash
for f in tests/*.test.mjs; do node "$f" > /dev/null || echo "FAIL $f"; done
npm run typecheck
node tools/build.mjs
(cd server && npx vitest run && npx tsc --noEmit)
(cd mobile && npm run typecheck && npm test)
```

**Visual check.** Open `tests/harness/panel-harness.html` (serve the repo root
over HTTP) at 390 × 884 in dark mode, next to the matching reference file, and
compare each state the prompt lists. If you can't run a browser, say so
plainly; the integrator will run the visual comparison. Never claim a visual
check you didn't do.

**Report:** what changed, file by file; failing tests before and passing
after; every place where the reference, the prose and the code disagreed and
what you chose; everything you couldn't verify.
