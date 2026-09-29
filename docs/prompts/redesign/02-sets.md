# Redesign 02: Sets

**Depends on:** 00
**Branch:** `redesign/02-sets`
**Reference:** `docs/design/reference/02-sets.html`, `docs/design/reference/logic.js`
**Read first:** `docs/prompts/redesign/README.md` and `AGENTS.md`.
**Touches:** `src/ui/views/sets.js`, `src/ui/panel.css`, a new `shared/titles.js`, `server/src/llm.ts` + `server/src/app.ts` (title and description from generation), `server/src/db.ts` (migration), `server/src/sync.ts`, `server/src/schema.ts`, `shared/sync-map.js`

Rebuild the Sets tab exactly as specified. The screen background is bg.app.
The content scrolls; the BottomNav is fixed with Sets active.

Scroll container: padding 18px 16px 28px (plus the docked-bar clearance), a
column with gap 14.

**Remove:** the tall set cards (title, "0% mastered", an empty bar, the source
in the corner) and the persistent teal outline on one card. No card is ever
highlighted at rest.

## 1. Header
Column, gap 2, padding 0 4px.
- "Sets" at 24px / 650 / −0.02em (the `<h1>`). Under it, "{setCount} sets ·
  {totalDue} cards due" at 13px / text.muted, with singulars ("1 set", "1
  card due").
- **No Import button and no capture buttons here.** The Sets tab shows only
  sets. Every create action lives in the capture dock (prompt 05). If the dock
  hasn't landed yet when you run this, leave the existing capture buttons where
  they are and say so. 05 removes them.
- The "Add a shared set" form leaves this screen too. It moves into the dock's
  "Add a set" sheet in 05. Until then, move it into the Import view.

## 2. Search and filter row
Flex, gap 8.
- **Search field:** a `<label>` wrapper, flex 1, min-width 0, flex with align
  centre, gap 10, height 44, padding 0 14, radius 12, bg.surface, 1px
  border.card, icon colour text.faint.
  - A magnifier icon 16px, then an `<input type="search">` (flex 1, min-width
    0, transparent, no border or outline, text.primary, 15px, inherits the
    font). Hide the browser's own clear button, so the design stays exact.
  - Placeholder "Search sets and cards", with `aria-label="Search sets and cards"`.
  - Filters live (debounced 150ms), matching the cleaned set title and the card
    question and answer text. It ignores case and accents (normalise with NFD
    and strip combining marks).
  - *Added:* focus-within makes the wrapper's border border.hover. Esc clears
    the field.
- **Filter button:** 44×44, radius 12, bg.surface, a sliders icon 18px (two
  horizontal lines, each with a knob circle r=2), doesn't shrink,
  `aria-label="Filter and sort"`.
  - Default: 1px border.card, icon text.secondary.
  - When a Show filter other than "All sets" is active: border border.hover
    (#34514c), icon accent.text, plus an 8×8 accent dot at top 8 / right 8
    with a 2px bg.surface ring.
  - Tapping it opens the Filter and sort sheet (step 4).
- **No horizontal chip row.** No source chips (AI Studio, YouTube…) and no
  topic or category chips on this screen. The source is already on every row's
  tile.

## 3. Result row
Flex, space-between, align centre, gap 8, min-height 30, padding 0 4px, 13px.
- Left group (flex, gap 8): "{n} set" or "{n} sets" (the count after filtering
  and search) in text.muted. It's in an `aria-live="polite"` region, so screen
  readers hear the result count change.
  - When a filter is active, a removable pill follows: height 28, padding 0 6
    0 10, radius 999, 1px border.hover, bg.surface2, text.primary, 13px / 600.
    It holds the filter name and a 14px "×" icon (stroke 2.4, text.muted), with
    gap 4. `aria-label="Clear filter"`. Tapping it resets Show to "All sets".
- Right: a sort text button (height 30, padding 0 4, transparent), text.secondary
  / 600, gap 6, with a 14px up/down arrows icon and the current sort name
  ("Most due" by default). Tapping it opens the same Filter and sort sheet.

## 4. Filter and sort sheet
A BottomSheet; panel padding 10px 16px 24px, gap 14.
- Title "Filter and sort" (18px / 650, padding 0 6px).
- Group "SHOW" (SectionLabel style, padding 0 6px 4px), then single-select rows
  (gap 4), `role="radio"` in a `role="radiogroup"`:
  - **All sets** · **Due now** (due > 0) · **Global** (made global, or added
    from Discover) · **Private**.
  - Global and Private only appear once the app knows which sets are global
    (prompt 09, or prompt 35 if it already landed). Until then, only the first
    two show.
  - A row: height 48, padding 0 12, radius 12, flex, gap 12. The label at
    15px / 600 (flex 1), then that option's live count at 13px / text.muted,
    then an 18px column holding a check icon (accent.text, stroke 2.4) when the
    row is selected.
  - Selected: bg.surface2, 1px border.hover. Unselected: transparent background
    and transparent border.
- Group "SORT BY", the same rows without counts: **Most due** (default) ·
  **Recently opened** · **A–Z** · **Newest**.
  - Most due: due count descending, then A–Z.
  - Recently opened: prompt 01's last-opened map, never-opened sets last,
    newest capture first.
  - A–Z: cleaned title, `localeCompare` with `sensitivity: "base"`.
  - Newest: `createdAt` descending.
- Selecting a row applies it immediately, and the list behind the sheet updates
  live.
- A primary button at the bottom: "Show {n} sets" ("Show 1 set"; height 50,
  radius 12, accent, 15px / 650). It closes the sheet.
- Tapping the overlay (or Esc) also closes it.
- Show is remembered for the panel session, in memory. Sort is kept across
  restarts, in `store.js` settings.

## 5. List
- A column, gap 8, of SetRow components (from 00), ordered by the selected sort.
- **No match:** centred, padding 28px 12px, 14px / text.muted: No sets match
  "{query}". With no query but a filter that matches nothing: "No sets match
  this filter."
- *Added:* **no sets at all:** the same style: "No sets yet. Capture a page or
  an AI answer with the buttons below."
- *Added:* tapping a row opens Set detail. Going back to Sets restores the
  search text, filter, sort and scroll position.

## Title cleanup (applies everywhere a set title shows)
- **`cleanTitle(raw)` in `shared/titles.js`,** pure and tested. It never
  displays raw chat transcript prefixes. It strips leading speaker labels
  (User, You, Me, Assistant, ChatGPT, Claude, Gemini, Model), with or without a
  following time ("9:59 AM", "09:59", "14:02"), a "said" or a colon. It also
  strips leading timestamps and dates, collapses whitespace, and trims. If
  nothing is left, it returns "Untitled set". Every view calls it; stored data
  isn't rewritten.
- **New sets get a short noun-phrase title** from the model, in the **same**
  `/v1/generate` call (no extra call; the free Groq tier is 8000 tokens a
  minute). For example, "What are the differences between WAN, LAN, PAN and
  MAN?" becomes "WAN, LAN, PAN & MAN". The model also returns a one-sentence
  **description**, e.g. "How the four network types differ in range and
  typical use." Validate both: title at most 60 characters, description at most
  160, both plain text. If the model gives no description, use the original
  question (cleaned) as the description.
- **The description is a new synced field on sets.** Follow README rule 8: a
  migration (`sets.description`), the schema, `sync.ts` with the `COALESCE`
  guard, and `sync-map.js` in both directions. Old sets simply have none.
- Regenerating a set updates its title and description **only if the learner
  hasn't renamed it** (the rename flag comes in prompt 09; until then,
  regeneration always keeps the existing title).

## Tests (write first)
- `cleanTitle`: "User 9:59 AM What is TCP?" → "What is TCP?"; "Assistant: …";
  "ChatGPT said: …"; "14:02 …"; empty → "Untitled set"; a clean title stays
  unchanged.
- Search matches the title, question and answer, ignores case and accents, and
  is debounced.
- Each sort order, and the Show filters with their live counts.
- The sheet's "Show n sets" count; the pill clears the filter; Sort persists
  and Show doesn't.
- There are no chip rows, no Import and no capture buttons in `sets.js` (once
  05 has landed).
- The description round-trips through sync; an old client without it doesn't
  blank it; the migration fingerprint and schema count are updated.
- The generate response carries a title and description with no extra model
  call (a stubbed provider called once).

## Visual check
Harness at 390 × 884, dark mode, next to `02-sets.html`: the default list, the
filter sheet open, a filter active (pill and dot), and the empty search.

## Report
As in README rule 12, plus the migration slot you used.
