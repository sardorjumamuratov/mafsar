# Redesign 01: Home

**Depends on:** 00
**Branch:** `redesign/01-home`
**Reference:** `docs/design/reference/01-home.html`, `docs/design/reference/logic.js`
**Read first:** `docs/prompts/redesign/README.md` and `AGENTS.md`.
**Touches:** `src/ui/views/home.js`, `src/ui/panel.css`, `src/ui/flows/review.js` (session entry points), `src/storage/store.js` (last opened)

Rebuild Home exactly as specified. The screen background is bg.app. The
content scrolls; the BottomNav stays fixed with Home active.

Scroll container: padding 18px 16px 28px (plus the docked-bar clearance from
00), a vertical column with gap 20px between blocks.

## Remove from the current Home
- The flame streak badge in the top right.
- The "Exam prep" card with the inline ISO date input, and the separate
  exam-picker screen (`exam-pick`, `picker-save`). Both are replaced by the
  Exam sheet below.
- The "This week" box grid and the "0 of 7 days" pill.
- The three stat tiles (Mastered / Progress / Sets).
- The "Needs work" list with a "Forget soon" pill on every row. Its data
  function can stay if something else uses it.
- The full "Your sets" card list and "View all N sets".
- The "+ Import" link (importing lives in the capture dock, prompt 05).

## Block 1: Greeting
Padding 0 4px, column, gap 2.
- "Good morning" at 14px / text.muted. By local time: 05:00–11:59 "Good
  morning", 12:00–17:59 "Good afternoon", otherwise "Good evening".
- "Today's review" at 24px / 650 / −0.02em / text.primary, as the page `<h1>`.

## Block 2: Today's goal hero
- Container: padding 20, radius 20, background accent, text accent.on, column,
  gap 14.
- Top group (column, gap 4):
  - Eyebrow "TODAY'S GOAL": 12px / 700 / letter-spacing 0.08em / uppercase /
    75% opacity.
  - Numeral row (baseline aligned, gap 8): "{goalCount}" at 52px / 700 /
    line-height 1 / −0.03em, then "cards" at 18px / 600 ("card" when it's 1).
  - Subline, 14px / 500: "~{goalMinutes} min · keeps you on pace for {Mon D}".
    With no exam date: "~{goalMinutes} min · a steady daily amount".
- Button "Start review": full width, height 50, radius 14, no border,
  background #ffffff (hover #f0fbf9), text accent.onWhite, 16px / 650. It
  starts a session with exactly goalCount cards, most overdue first (oldest
  `dueDate` first).
- Footer row (space-between, 13px / 500): on the left "{totalDue} due across
  {setCount} sets" ("1 set" singular); on the right "Review all" at weight 650,
  underlined with a 3px offset, a real `<button>`. "Review all" starts a
  session with every due card.
- **Goal logic** (put it in a pure function in `shared/`, e.g.
  `shared/daily-goal.js`, and test it):
  - `totalDue` = due cards across all sets. `setCount` = sets with at least one
    due card.
  - With an exam: `goalCount = min(totalDue, ceil(totalDue / max(1, daysUntilExam)) + learningDueToday)`.
    `daysUntilExam` counts whole local days to the **nearest upcoming** exam
    date across all sets. An exam in the past counts as no exam.
    `learningDueToday` = cards in the Learning state due before local midnight.
  - With no exam: `goalCount = min(totalDue, 40)`.
  - `goalMinutes = round(goalCount × 22 / 60)`, at least 1 when goalCount > 0.
  - If `totalDue` is 0: the numeral shows "0", the subline "You're all caught
    up", and the button and "Review all" are hidden.
- The session entry points take a card list: extend the review flow so a caller
  can pass the exact cards (`startReview({ cardIds })` or similar), in the order
  given. Say what you changed.

## Block 3: This week
- Card: padding 16, radius 16, bg.surface, 1px border.card, column, gap 14.
- Header row: SectionLabel "This week" on the left. On the right, at 13px /
  text.body2: "Start a streak today" when the streak is 0, otherwise
  "{n}-day streak" (from `computeStreak` in `shared/streak.js`).
- Grid: 7 equal columns, gap 6. The last 7 local days, ending today. Each cell
  is a column (align centre, gap 6):
  - A circle 32×32, radius 16, 2px border.
    - Past day, not studied: border #27322f, transparent fill.
    - Studied day (activity count > 0): border and fill #34bcad.
    - Today: border #34bcad, filled too if already studied.
  - A label at 12px: the one-letter weekday (M T W T F S S). Past days: weight
    500, text.faint. Today's label reads "Today" at weight 700, accent.text.
  - Each cell has an accessible label, e.g. "Monday, studied" or "Today, not
    studied yet".

## Block 4: Exam status
The whole card is a `<button>` that opens the **Exam sheet**.
- Card: padding 16, radius 16, bg.surface, 1px border.card, column, gap 12,
  left-aligned text.
- Top row (gap 12, align centre):
  - Icon tile 36×36, radius 10, bg.surface2, a calendar icon 18px in
    accent.text.
  - Column (flex 1, gap 2): "Exam · {Ddd, Mon D}" at 15px / 600 (e.g. "Exam ·
    Tue, Oct 14"); "{n} days left · {k} sets included" at 13px / text.muted.
    Say "1 day left" and "Exam today", and "1 set included".
  - "Edit" at 13px / 600 / accent.text.
- Readiness group (column, gap 6): a row (space-between, 13px / text.body2)
  with "Ready" on the left and "{readiness}%" on the right (text.primary /
  600). Then a bar: 6px tall, radius 3, track #27322f, accent fill sized to
  readiness.
- `readiness` = the share of cards in the included sets that are Mastered,
  rounded.
- **No exam date:** the same card shape, titled "Add an exam date", with the
  subline "Get a countdown and a daily target", the right action "Add", and no
  readiness group. Tapping it opens the Exam sheet. Never send the user to
  another screen.
- Dates are formatted as in the reference (English, e.g. "Tue, Oct 14"),
  with an explicit `en-US` formatter so the output doesn't change with the
  machine's locale.

### The Exam sheet (added: the design shows the card, not the editor)
A BottomSheet (list-sheet layout, panel padding 10px 16px 24px, gap 14), built
from the same pieces as prompt 02's Filter and sort sheet:
- Title "Exam date" (18px / 650, padding 0 6px).
- The vendored flatpickr calendar, **inline** (not a popup), themed entirely
  with tokens: day cells 36px, today ringed in accent.text, the selected day
  filled with accent and text in accent.on, past days disabled at text.faint.
  The minimum date is today.
- SectionLabel "SETS IN THIS EXAM", then one row per set (height 48, padding 0
  12, radius 12, gap 12): the set title at 15px / 600 (flex 1, `cleanTitle`),
  and an 18px check slot on the right. Selected rows: bg.surface2 with a 1px
  border.hover. This is a multi-select list (`role="checkbox"`,
  `aria-checked`). When a date is already set, the sets that have it are
  preselected. With no exam yet, every set with cards is preselected.
- A primary button "Save exam" (height 50, radius 12, accent, 15px / 650),
  disabled until a date and at least one set are chosen. It writes `examDate`
  to the chosen sets through the existing store functions the old picker used,
  and clears it from sets that were unticked.
- When an exam exists, a text button "Remove exam" (height 40, 14px / 600,
  danger.text) clears the date from every set in it.
- Opened from a set's exam row (prompt 03), the same sheet preselects that set.

## Block 5: Fading soon
Hide the whole block when it has 0 items.
- Header: SectionLabel "Fading soon", with the right action "Review {n}",
  which starts a session with only these cards (all n, not just the three
  shown). The review flow must accept cards that aren't due yet for this.
- Card: radius 16, bg.surface, 1px border.card, padding 0 14px.
- Up to 3 rows. Each row is a `<button>`: flex, gap 12, align flex-start,
  padding 13px 0, 1px bottom border border.divider (none on the last row).
  - A StatusDot in amber, 7px top margin, doesn't shrink.
  - Question text: 15px / line-height 1.4 / `text-wrap: pretty`, clamped to 2
    lines (`display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden`).
    Never truncate to 1 line with an ellipsis.
- No per-row pill and no chevron. Tapping a row opens that card's set with the
  card expanded and scrolled into view.
- **Source:** cards that are *not* due now but whose predicted recall drops
  below the scheduler's desired retention within the next 24h, lowest current
  recall first. Use the FSRS retrievability in `shared/srs.js`, and put the
  selection in a pure, tested function. Link cards (chains) count like any
  other card.

## Block 6: Continue
Column, gap 8. Hidden when there are no sets.
- Header: SectionLabel "Continue", with the right action "All {setCount} sets"
  (every set, not just those due), which goes to the Sets tab.
- The 3 most recently opened sets, as SetRows (from 00), gap 8.
- *Added:* "Recently opened" is new state: a device-local map of set id to
  last-opened time, in `store.js` under the account partition. It isn't synced,
  and it's written whenever Set detail opens. Sets never opened fall back to
  their capture time, newest first. Prompt 02's "Recently opened" sort uses the
  same map.

## Added: states the design doesn't show
- **No sets at all** (a new account): Block 1 stays, and blocks 2–6 are replaced
  by one card (padding 16, radius 16, bg.surface, 1px border.card, column, gap
  6): "Make your first set" at 15px / 600, then "Open an AI chat, a web page or
  a YouTube video, then tap Capture below." at 14px / line-height 1.45 /
  text.body2. When signed out, add an OutlineButton "Sign in to make cards"
  (height 36, padding 0 12, radius 10, accent.text) that opens You.
- **First sync in flight on an empty device** (prompt 31): skeletons shaped like
  the hero and the week card, not the "no sets" card.
- **Repaint safety:** Home repaints after a sync through prompt 31's
  mechanism, never while the Exam sheet is open.

## Tests (write first)
- Goal logic: with an exam, without one, an exam in the past, `totalDue = 0`,
  and the singular cases.
- Fading-soon selection: excludes due cards, includes those crossing within
  24h, lowest recall first.
- Week strip: the right 7 days ending today; studied, not studied and today
  states.
- Greeting boundaries at 04:59, 05:00, 11:59, 12:00, 17:59 and 18:00.
- The removed blocks are gone (a static check); Continue uses the last-opened
  map.
- The Exam sheet saves and clears `examDate` on exactly the chosen sets.

## Visual check
Harness at 390 × 884, dark mode, next to `01-home.html`: the full Home with an
exam, without an exam, with 0 due, and the no-sets state (which has no
reference, so apply the tokens only).

## Report
As in README rule 12.
