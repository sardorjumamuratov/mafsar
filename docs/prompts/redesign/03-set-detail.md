# Redesign 03: Set detail

**Depends on:** 00, 02 (`cleanTitle`, description)
**Branch:** `redesign/03-set-detail`
**Reference:** `docs/design/reference/03-set-detail.html`, `docs/design/reference/logic.js`
**Read first:** `docs/prompts/redesign/README.md` and `AGENTS.md`.
**Touches:** `src/ui/views/set-detail.js`, `src/ui/panel.js`, `src/ui/panel.css`, `src/ui/share.js`, `src/ui/icons.js`, `server/src/llm.ts` (structured summary, optional)

Rebuild Set detail exactly as specified. This is the final version. It
combines mock 1a (header, progress, exam row, tabs, info sheet) with mock 2c
(split study button, anchored mode menu, add card, per-card actions, undo).
The screen background is bg.app. The content scrolls; the BottomNav is fixed
with **Sets** highlighted. *Added:* Back returns to wherever the learner came
from (Home, Sets, Discover), not always Sets. Opening this screen records the
set in prompt 01's last-opened map.

## Remove from the current screen
- The raw "User 9:59 AM …" heading.
- The "0% mastered · 0 of 10" card.
- The three stat tiles (New / Learning / Mastered).
- The "Set an exam date on Home…" tip box.
- The permanent paragraph explaining the learning states.
- "Due now" on every row.
- The hover-only pencil and trash icons on rows.
- The bottom stack of buttons ("Teach it back", "+ Card", "Type answers") and
  the sticky "Review N due" footer (`.footer-cta`).
- The "Share link" text button (it becomes an icon).
- The Quiz tab (Quiz becomes a study mode).
- The mode-specific blocks under the list ("Coding exercises", "Medicine
  practice", "System design practice"). They move into the study-mode menu
  (step 7).

## 1. Top bar
Flex, align centre, gap 8, padding 12px 14px 8px.
IconButton Back (`aria-label="Back"`), a flexible spacer, IconButton Share
(`aria-label="Share"`), then IconButton More (`aria-label="More"`,
`aria-haspopup="dialog"`).

## 2. Header
Padding 8px 20px 0, column, gap 8.
- **Meta row** (flex, align centre, gap 8, 13px / text.muted):
  - Source chip: padding 3px 9px, radius 999, background accent.chipBg, text
    accent.text, 12px / 600, gap 6. A 6×6 dot in accent.dot, then the source
    name (`sourceLabel`, e.g. "AI Studio").
  - "{cardCount} cards · {created}". Created reads "Today, 9:59", "Yesterday,
    14:02" or "Sep 21" (the date alone when older than yesterday; add the year
    when it isn't the current year). The time uses the reference's 24-hour
    `H:mm`.
  - Prompt 09 adds a "Global" chip after the source chip.
- **Title:** 27px / 650 / line-height 1.15 / −0.02em, as the page `<h1>`. The
  title goes through `cleanTitle()`.
- **Description** (only when present, from prompt 02): 15px / line-height 1.45
  / text.body2 / `text-wrap: pretty`.

### 2b. Rating row
Inside the header column, right after the description. The exact spec is in
prompt 07. Until 07 lands, render nothing here (no empty gap).

### Added: medicine suggestion
When the set looks medical (`suggestMedicine`, not dismissed, not already
medicine), show a callout right after the header (margin 14px 20px 0, padding
12px 14px, radius 12, bg.surface2, column, gap 10): "This looks like medicine.
Organise it as mechanism chains?" at 14px / line-height 1.45 / text.secondary,
then a row (gap 8) of two OutlineButtons (height 36, padding 0 12, radius 10):
"Not now" in text.primary, and "Use Medicine" in accent.text. The behaviour is
unchanged.

## 3. Progress
Margin 14px 20px 0, column, gap 10. Hidden when the set has no cards.
- **Segmented bar first:** height 8, radius 4, overflow hidden, 3px gaps
  between segments. Three segments with `flex-grow` equal to the counts: New
  #3b4845, Learning #e3a246, Mastered #45c483. A segment with count 0 gets
  `flex: 0` and disappears (so do the gaps around it). `role="img"` with an
  `aria-label` that says the counts.
- Then a row (flex, space-between, align centre, 13px):
  - Left: "{new} new · {learning} learning · {mastered} mastered" in text.body2
    (#a9b6b2). Plain text: no dots, no bold.
  - Right: a text button, height 28, padding 0 2px, no border, transparent, gap
    5, 13px / text.muted. It holds a 15px info-circle icon (stroke 2), then
    "How it works", and opens the How-it-works sheet (step 8).

## 4. Study actions
Margin 18px 20px 0, column, gap 8.
- **SplitPrimaryButton** (from 00). The left label and meta depend on the
  selected mode (n = due cards in this set):

  | Mode | Label | Meta |
  |---|---|---|
  | Flashcards | "Review {n} cards" | "~{round(n×30/60)} min" |
  | Type answers | "Type {n} answers" | "~{round(n×48/60)} min" |
  | Teach it back | "Teach it back" | "~5 min" |
  | Quiz | "Start quiz" | "{q} questions" |

  *Added, for states the table doesn't cover:*
  - **Nothing due:** Flashcards reads "Study ahead" · "~{round(total×30/60)} min"
    (reviewing every card, as today's "Study ahead" does). Type answers reads
    "Type {total} answers", using all cards.
  - **No cards:** the left button is disabled and reads "Add cards to study",
    with no meta.
  - **Quiz:** `q = min(10, stored quiz questions)`. If the set has none, the
    Quiz item in the menu is disabled with the description "No quiz for this
    set" ("Imported sets are flashcards only" for imports). If the remembered
    mode is Quiz and this set has no quiz, fall back to Flashcards.
  - Minutes are at least 1, and singulars are handled ("Review 1 card").
  - Set-type modes from step 7 have their own labels (listed there).
- Under the button: "Mode: {Mode name}" at 13px / text.muted, with the mode
  name in text.secondary / 600, padding 0 2px.
- Remember the last selected mode **per account, not per set,** in `store.js`
  settings, so it survives restarts. The default is Flashcards. A remembered
  set-type mode (e.g. Chain drill) on a set of another type falls back to
  Flashcards.
- **Exam row** (a full-width `<button>`): flex, align centre, gap 12, padding
  12px 14px, radius 14, 1px border.control, bg.surface, left-aligned text.
  - Icon tile 36×36, radius 10, bg.surface2, a calendar icon 18px in
    accent.text.
  - Column (flex 1, gap 2): title 14px / 600, subtitle 13px / text.muted.
  - Right: an action word at 13px / 600 / accent.text.
  - No exam date: "Add an exam date" / "Get a countdown and a daily target" /
    "Add".
  - With an exam date: "Exam · {Ddd, Mon D}" / "{d} days left · {k} new
    card(s) a day" / "Edit". `k` is `examReadiness(...).dailyTarget`. Handle
    "Exam today" and "1 day left".
  - *Added:* a past exam reads "Exam passed" / "Pick a new date" / "Edit".
  - Tapping it opens prompt 01's **Exam sheet** on this screen, with this set
    preselected. It never navigates away.

## 5. Segmented tabs
Margin 24px 20px 0.
- Container: flex, padding 3, radius 12, bg.surface, 1px border.card,
  `role="tablist"`.
- Tabs: "Cards" and "Summary", plus **"Chains" for medicine sets** (*added*:
  the existing chains view keeps its place as a third tab of the same style).
  Each: flex 1, height 36, no border, radius 9, 14px / 600, `role="tab"`,
  `aria-selected`.
  - Active: background bg.segmentActive, text text.primary.
  - Inactive: transparent background, text text.faint.
- Quiz is **not** a tab any more; it's a study mode.

## 6a. Cards tab
- **Group header** (margin 16px 20px 0; flex, align centre, gap 8):
  - SectionLabel "Due now", then a CountBadge with the count, then a spacer.
  - Right: OutlineButton "Add card", height 32, padding 0 10, radius 9,
    accent.text, with a "+" icon 14px (stroke 2.2). It opens the add-card
    editor (prompt 06; until then, the existing in-row editor from prompt 32,
    never a separate form).
- More groups below, only when they have items, in this order: "Due now",
  "Later", "Mastered". Same header style. "Add card" appears only on the
  **first visible** group header. If the set has no cards, show the "Due now"
  header with a count of 0 and "Add card", then one line at 14px /
  text.muted: "No cards yet."
  - *Added definitions:* Due now = `isDue(card)`. Mastered = not due and
    `masteryOf(card) === "mastered"`. Later = everything else.
  - Within a group: Due now oldest due first; Later soonest due first;
    Mastered in set order.
- **List:** margin 8px 12px 24px. Each card row:
  - A wrapper with a 1px bottom border border.divider.
  - Row button: full width, flex, align flex-start, gap 12, padding 14px 8px,
    transparent, left-aligned text, `aria-expanded`, and `aria-controls` for
    its panel.
    - A StatusDot for the card's state, 7px top margin.
    - Question: flex 1, 15px, line-height 1.4, `text-wrap: pretty`, not
      truncated.
    - A chevron-down 16px, stroke #6d7c78, 3px top margin, which rotates 180°
      when open (`transition: transform 0.2s`; none with reduced motion).
  - **Expanded area** (one card open at a time; opening another closes the
    previous):
    - Container: margin 0 8px 14px 28px, column, gap 10.
    - Answer panel: padding 10px 12px, radius 10, bg.surface, 14px /
      line-height 1.45 / text.answer. Line breaks in the answer are kept
      (`white-space: pre-wrap`).
    - Actions row, gap 8:
      - "Edit": OutlineButton, height 36, padding 0 12, radius 10,
        text.primary, a pencil icon 14px. It switches the card to in-place edit
        mode (prompt 06), and never opens a separate screen, modal or divider.
      - "Delete": the same button, but text and icon in danger.text, with a
        trash icon 14px. It deletes immediately with **no** confirm, collapses
        the row, and shows a Toast "Card deleted" with an "Undo" action (4s).
        Undo restores the card in its original position. The delete is written
        to storage (tombstone, then sync) only after the toast expires, or on
        `pagehide` (README rule 7).
    - *Added:* **link cards** (made from a mechanism chain) have no Edit or
      Delete. Instead: "Made from a mechanism chain. Edit it in Chains." at
      13px / text.muted, and an OutlineButton "Open Chains" (height 36, padding
      0 12, radius 10, accent.text) that switches to the Chains tab.
- All counts (header meta, legend, CTA label, badge, progress bar) update live
  after a delete or undo.
- No card is expanded by default. (The mock opens one only to show the state.)

## 6b. Summary tab
- Container: margin 16px 20px 24px, column, 1px border.control, radius 14,
  overflow hidden.
- Rows: a grid with columns `56px minmax(0, 1fr)`, gap 12, padding 14px 16px,
  bg.surface, 1px bottom border border.divider (none on the last row).
  - Key column: 15px / 700 / accent.text (e.g. "PAN").
  - Right column (gap 2): a primary line at 14px / 600 (e.g. "~10 m · one
    person"), and a secondary line at 13px / line-height 1.4 / text.body2
    (e.g. "Bluetooth earbuds, smartwatch").
- *Added, where the rows come from:* today's summary is `{ summary, keyPoints }`.
  Extend the summarize call to also return, **in the same model call,** an
  optional `terms: [{ key, primary, secondary }]` when the content compares or
  defines up to 8 things (key ≤ 6 characters, primary ≤ 40, secondary ≤ 90,
  plain text, validated). With `terms`, render the rows. Without them, render
  the summary and key points as paragraphs at 15px / line-height 1.5 /
  text.body2 inside the same container, padding 16, gap 10.
- *Added:* **no summary yet** and the set has its source conversation: the
  container (padding 16, gap 12) holds "Get a short summary of this set." at
  15px / text.body2, and an OutlineButton "Summarize" (height 36, padding 0
  12, radius 10, accent.text), which runs the existing summarize action. With
  no source (imports): the first 8 card questions as paragraphs, as today.
- *Added:* the **Set type** choice (General / Coding / System design /
  Medicine) leaves this tab. It moves into the ⋯ sheet (below).

## 7. Study-mode menu
An anchored popover, **not** a bottom sheet.
- It opens from the chevron half of the SplitPrimaryButton and appears directly
  under the button, in place. The page doesn't dim, and nothing slides up from
  the bottom.
- **Wrapper:** the split button and menu sit in a `position: relative`
  container. While the menu is open, raise the container's z-index to 6, so
  the menu overlays the content below it.
- **Chevron button while open:** background #2aa396 (accent.pressed), and the
  chevron rotates 180° (`transition: transform 0.2s`). It has
  `aria-haspopup="menu"` and `aria-expanded` set to true or false.
- **Menu panel:** `position: absolute`, top 62px (54px button + 8px gap), left
  0, right 0 (the same width as the split button). Padding 6, radius 16,
  background bg.sheet (#151e1c), 1px border.control, shadow `0 18px 40px
  rgba(0,0,0,.55)`, column, gap 2, `role="menu"`, `aria-label="Study mode"`.
- **Pointer notch:** a 12×12 square with background bg.sheet and a 1px
  border.control on its left and top edges only, rotated 45°. Position it
  absolute at top −7px, right 20px, so it points at the chevron.
- **Header:** "STUDY MODE", padding 8px 10px 6px, 12px / 600 / uppercase /
  letter-spacing 0.04em / text.muted.
- **Four items.** Each is a `<button>` with `role="menuitemradio"` and
  `aria-checked`: flex, align centre, gap 12, padding 10, radius 12, no border,
  left-aligned text. Hover background bg.surface2; the selected item's
  background is bg.surface2.
  - Icon tile: 36×36, radius 10, holding an 18px line icon (stroke 2, round
    caps and joins).
    - Selected: tile background accent (#34bcad), icon accent.on (#04211d).
    - Unselected: tile background bg.surface2, icon accent.text.
  - Text column (flex 1, gap 2): name at 15px / 600, description at 13px /
    text.muted.
  - A trailing 18px slot: a check icon (accent.text, stroke 2.4) when selected,
    empty otherwise, so the text never shifts.
  - A disabled item: 45% opacity, not focusable by arrow keys, with its reason
    as the description.
- **The items and their icons** (24×24 paths):
  - **Flashcards:** "Flip and grade yourself". Path `M8 4h11a1 1 0 011 1v12M4 8h11a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z`.
  - **Type answers:** "Write from memory, checked for you". Path `M3 7a1 1 0 011-1h16a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1zM7 10h.01M11 10h.01M15 10h.01M8 14h8`.
  - **Teach it back:** "Explain the topic in your own words". Path `M12 3a3 3 0 00-3 3v5a3 3 0 006 0V6a3 3 0 00-3-3zM6 11a6 6 0 0012 0M12 17v4`.
  - **Quiz:** "{q} multiple-choice questions". Path `M10 6h10M10 12h10M10 18h10M4 6l1.2 1.2L7.5 5M4 12l1.2 1.2L7.5 11M4 18l1.2 1.2L7.5 17`.
- ***Added:* set-type practice.** Mafsar's coding, system-design and medicine
  sets have practice modes the mock doesn't show. They join the same menu,
  after a divider (1px border.divider, margin 4px 10px) and a second header in
  the same style as "STUDY MODE", using identical item styling. These icons
  aren't in the reference, so use the paths below, drawn in the same style. The
  report must flag them for design sign-off.

  | Set type | Header | Item: name / description / CTA label · meta | Icon path |
  |---|---|---|---|
  | coding | CODING | Coding exercise / "Small tasks from these cards" / "Start exercise · ~10 min" | `M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14` |
  | design | SYSTEM DESIGN | Design drill / "Design it, then handle curveballs" / "Start design drill · ~15 min" | `M4 4h6v6H4zM14 14h6v6h-6zM10 7h4a2 2 0 012 2v5` |
  | design | | Estimation / "Back-of-envelope numbers" / "Start estimation · ~5 min" | `M5 3h14a1 1 0 011 1v16a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1zM8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01` |
  | design | | Find the bottleneck / "Spot what breaks first" / "Find the bottleneck · ~10 min" | `M4 5h16l-6 7v6l-4 2v-8z` |
  | medicine | MEDICINE | Chain drill / "Rebuild each mechanism step by step" / "Start chain drill · {k} chains" | `M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1` |
  | medicine | | Clinical case / "Work through a patient" / "Start clinical case · ~10 min" | `M9 4h6v3H9zM7 5H6a1 1 0 00-1 1v14a1 1 0 001 1h12a1 1 0 001-1V6a1 1 0 00-1-1h-1M9 12h6M9 16h4` |
  | medicine | | Compare conditions / "Side by side, step by step" / "Compare conditions · {k} chains" (only with 2+ chains) | `M12 4v16M5 8h4M5 12h4M5 16h4M15 8h4M15 12h4M15 16h4` |

  The CTA for each starts the existing flow (`start-coding`, `start-design`,
  `start-estimation`, `start-bottleneck`, `start-chain-drill`,
  `start-clinical-case`, `start-compare`).
- **Too tall:** the menu gets `max-height` equal to the space available in the
  chosen direction minus 16px, with `overflow-y: auto`.
- **Close the menu on:** picking an item, tapping the chevron again, tapping
  anywhere outside (a transparent full-screen catcher behind the menu), Esc,
  or scrolling the page more than 24px.
- **Keyboard:** when the menu opens, focus the selected item. ↑/↓ move between
  enabled items (wrapping around), Home/End jump to the first and last,
  Enter/Space selects, Tab closes and moves focus on. On close, focus returns
  to the chevron.
- **Animation:** opacity 0→1 plus translateY(−4px)→0 and scale 0.98→1, 140ms
  ease-out, `transform-origin: top right`. Close in reverse over 100ms. Honour
  `prefers-reduced-motion` (fade only).
- Picking an item sets the mode, closes the menu, and updates the CTA label and
  the "Mode:" line. It does **not** start the session.
- **Not enough room below** (the button is within 320px of the bottom of the
  visible area, above the docked bars): open the menu upward instead, at
  bottom 62px, with the notch on the bottom edge (bottom −7px, right 20px,
  borders on the right and bottom edges) and `transform-origin: bottom right`.

## 8. How-it-works sheet
A BottomSheet; panel padding 10px 22px 28px, gap 16.
- Title "How cards progress".
- Three rows (column, gap 14). Each row: flex, gap 12, a 10×10 status dot with
  a 5px top margin, then a column (gap 2) with the state name at 15px / 600 and
  an explanation at 14px / line-height 1.4 / text.body2:
  - **New:** "Not reviewed yet."
  - **Learning:** "After your first correct answer."
  - **Mastered:** "When the next review is 6+ days away — about a week of good
    answers."
- Callout: padding 12px 14px, radius 12, bg.surface2, 14px / line-height 1.45
  / text.secondary: "Tapping **Again** shows the card later in the session and
  restarts its schedule." Only "Again" is bold.
- A full-width button "Got it": height 48, radius 12, no border, background
  bg.segmentActive, text.primary, 15px / 600. It closes the sheet.

## Added: the ⋯ sheet (this prompt builds it; prompt 09 adds two rows)
The More button opens a BottomSheet with the row style of prompt 09 §A: panel
padding 10px 12px 24px, gap 2, grabber margin-bottom 10, no title
(`aria-label="Set actions"`). Each row is a `<button>`: flex, gap 14, padding
12, radius 12, transparent, left-aligned. Hover/press background bg.surface2.
A 36×36 icon tile (radius 10, bg.surface2), then a text column (title 15px /
600, description 13px / text.muted).

The final order, once 09 lands: **Make it global** (09) · **Rename set** (09) ·
**Regenerate cards** · **Set type** · **Delete set**. This prompt builds the
last three:
- **Regenerate cards** (refresh icon, accent.text): "Rebuild cards from the
  source. Matching cards keep their schedule." It runs the existing
  confirm-then-regenerate flow, now on the new confirm sheet. It's hidden for
  sets with no source to rebuild from.
- **Set type** (a tag icon, accent.text): the current type as the description
  ("General", "Coding", "System design", "Medicine"). It opens a list sheet
  (the Filter and sort sheet's row style) with the four types and their
  existing hints. Picking one runs the existing `set-mode` action.
- **Delete set** (trash icon, title in danger.text, no description): deletes
  with a Toast "Set deleted" + "Undo" (4s), then goes Back. Undo reopens the
  set. Nothing is written until the toast expires (README rule 7).

## Added: the Share sheet
The Share icon opens a BottomSheet (info-sheet layout, panel padding 10px 22px
24px, gap 16) titled "Share this set", with the existing share logic from
`src/ui/share.js`:
- The body at 14px / line-height 1.45 / text.body2: "Anyone with the link can
  add a copy. Your progress stays yours."
- With no active link: a primary button "Create link" (height 50, radius 12,
  accent, 15px / 650).
- With a link: a read-only field styled like the search field (height 44,
  radius 12, bg.surface, 1px border.card, 15px, text.primary, text selected on
  focus). Then "Copy link" (height 50, radius 12, accent), which shows the Toast
  "Link copied". Then a text button "Stop sharing" (height 40, 14px / 600,
  danger.text) that revokes after a confirm.
- Signed out: the body explains that sharing needs an account, and the button
  reads "Sign in" (opens You).

## Added: no cards were generated
When the set has no study set (generation failed or was skipped), keep the top
bar and header, and replace sections 3–6 with a card (margin 18px 20px 0,
padding 16, radius 16, bg.surface, 1px border.card, column, gap 12): "Cards
weren't made yet" at 15px / 600, then "Generation needs a connection and a
signed-in account." at 14px / line-height 1.45 / text.body2, then a button
with PrimaryButton styling **without** the play icon, labelled "Make cards",
running the existing `make-set` action.

## Tests (write first)
- CTA labels and metas for every mode, including nothing due, no cards, no
  quiz, singulars, and a set-type mode on the wrong set type.
- The mode persists per account and survives a reload.
- Group assignment (Due now / Later / Mastered) and the ordering within each.
- Delete → Undo restores the same position and writes nothing; delete →
  expiry writes one tombstone; delete → `pagehide` writes it.
- Link cards have no Edit or Delete.
- Menu: `role`/`aria-checked`, focus on open, arrow keys skip disabled items,
  Esc and an outside tap close it, it opens upward near the bottom.
- The `.footer-cta` and Quiz tab are gone; the Chains tab appears only for
  medicine sets.
- The ⋯ sheet rows; Delete set with undo.
- The summary: `terms` validated and rendered as rows, and a fallback to
  paragraphs.
- The created-date formats: today, yesterday, older, another year.

## Visual check
Harness at 390 × 884, dark mode, next to `03-set-detail.html`: collapsed
list; card 2 expanded; study-mode menu open (and opening upward); the
How-it-works sheet; the Summary tab with terms; the ⋯ sheet; a medicine set
with the Chains tab.

## Report
As in README rule 12. List the added set-type icons for design sign-off.
