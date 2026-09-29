# Redesign 05: Capture dock (mocks 3b, 3c, 3d)

**Depends on:** 00
**Branch:** `redesign/05-capture-dock`
**Reference:** `docs/design/reference/01-home.html` and `02-sets.html` (the dock and nav at the bottom)
**Read first:** `docs/prompts/redesign/README.md` and `AGENTS.md`.
**Touches:** `src/ui/panel.html`, `src/ui/panel.css`, `src/ui/panel.js`, `src/ui/capture.js`, `src/ui/tab-watch.js`, `src/ui/views/sets.js`, `src/ui/views/import.js`, `src/ui/sheet.js`

Move every create action out of the Sets screen into a capture dock attached
to the top of the BottomNav. **If prompt 33's dock already exists, restyle and
extend it to this spec. Don't build a second one.**

## Remove
- "Capture this page" and "Capture last answer" from wherever they are now
  (the Sets screen).
- The "Import" button in the Sets header, and the "Add a shared set" form.
- The Sets tab keeps only the list of sets and the tools to find them (search,
  the filter button, sort).

## Dock layout
- One fixed bottom panel made of two stacked parts: the **Dock** (top) and the
  **BottomNav** (bottom). They share background bg.nav (#0b1110) and look like a
  single surface. The dock lives in `panel.html` (the shell), not inside a
  view, so it doesn't flash when switching tabs.
- **Dock:** height 60 (padding 8px 12px), a 1px top border border.divider
  (#1e2826), flex, gap 8. The BottomNav under it has **no** top border. Remove
  00's temporary nav border.
- **Three buttons, in order:**
  1. **"Capture page":** flex 1, height 44, radius 12, 1px border.control,
     background bg.surface, text.primary, 14px / 600, centred with gap 8. A
     leading 16px icon (the four corner brackets of a frame, stroke 2,
     accent.text).
  2. **"Capture answer":** the same style. A leading 16px icon (a speech bubble
     with a tail at the bottom left, stroke 2, accent.text).
     `aria-label="Capture last answer"`. The visible label stays short, so both
     buttons fit on a 360px-wide screen. *Added:* at 320px, labels shrink to
     13px and the gap to 6. They never wrap or truncate.
  3. **"+":** 44×44, the same style, a "+" icon 18px (stroke 2.2).
     `aria-label="Import or create"`. It opens a BottomSheet titled **"Add a
     set"**.
- **Hover** (pointer devices): the border becomes border.hover.
  **Disabled:** 45% opacity.

## The "Add a set" sheet (the design lists three options; the fourth is added)
A BottomSheet using the list-row style of 03's ⋯ sheet (36×36 icon tile,
title 15px / 600, description 13px / text.muted), with the title "Add a set":
1. **Import file**: "CSV, Anki or Quizlet". Opens the existing Import view.
2. **Paste text**: "Make cards from notes you paste". Opens a sheet with a
   textarea (the editor style from 06, min 6 rows, max 30,000 characters,
   counted) and a primary "Make cards" button (height 50, radius 12, accent),
   disabled while it's empty. It creates a set with source `text` (tile `TXT`)
   through the **same generation path as a capture**, with the same quota and
   sign-in rules, then behaves like a successful capture (the toast below).
3. **Create empty set**: "Start from scratch and add cards yourself". Asks for a
   title in a small sheet (a search-field-style input and a "Create" button),
   creates a set with source `manual` (tile `ME`) and no cards, and opens its
   Set detail with the add-card editor open.
4. ***Added:* Enter a share code**: "Add a set someone shared with you". The
   existing share-code lookup, preview and "Add to my sets" (prompt 33 or the
   Import view has it now), inside this sheet, with the same duplicate check.
   The design forgot it, but it's the only way to redeem a share link.

## Where the dock shows
- Visible on Home, Sets, Set detail, Discover and Stats (and You and Teams:
  *added*, since they're bottom-nav screens too).
- Hidden during a review, quiz or any focus view (`showChrome(false)`), and
  while a card is in edit mode (prompt 06). When it's hidden, the nav stays and
  the content area grows by 60px. (The design also hides it "while the
  on-screen keyboard is open". There's no such thing on desktop; ignore it.)
- Content bottom padding and the toast position follow whether the dock is
  showing (00).

## Behaviour
- **Capture page** captures the active tab's content, and **Capture answer**
  captures the last assistant message on the active AI chat page, both with
  the existing logic. **Keep:**
  - The permission request happens **synchronously inside the click,** before
    any `await`. The buttons carry `data-kind` / `data-origin` for this,
    refreshed when the active tab changes (`tab-watch.js`).
    `tests/ui-static.test.mjs` pins it. Update what it points at; never weaken
    it.
  - The `tabId` targeting, so a capture from tab mode hits the page the learner
    means (prompt 23).
- **While capturing,** the tapped button's label changes to "Capturing…", and
  both capture buttons are disabled. The width stays fixed and the layout
  doesn't shift. The label stays "Capturing…" through capture **and**
  generation, until the cards exist or it fails.
- **On success,** show a Toast "New set from page · {n} cards" or "New set from
  answer · {n} cards", with the action **"Open"** (goes to the new set). The
  user stays on the current tab. (This changes today's behaviour, which jumps
  to the new set.) Captures from YouTube or a PDF say "New set from video · {n}
  cards" / "New set from PDF · {n} cards".
- **On failure,** show a Toast "Couldn't capture this page" with the action
  **"Retry"**.
- *Added, the failures the design doesn't list, each with its own toast:*
  - Not signed in: the page is saved, no cards. "Saved · sign in to make
    cards", action "Sign in" (opens You).
  - Quota used up: "Saved · you've used this month's sets", action "Plans"
    (opens You's plan block).
  - Saved but generation failed: "Saved · couldn't make cards", action "Open".
  - Site access declined: "Mafsar needs access to this site to capture it", no
    action.
- **If the current page can't be captured** (e.g. no supported chat on the
  page, a `chrome://` page, the store, Mafsar's own page), the button still
  shows and stays enabled. Tapping it gives a toast saying why: "No answer
  found on this page" (Capture answer), or "This page can't be captured"
  (Capture page). Never hide or grey out a button without saying why.
- **Toast position:** bottom 138px, above the dock and nav.

## Tests (write first)
- The dock is in `panel.html`, and there are no capture, import or share-code
  controls in `sets.js`.
- The permission request comes before any `await` in both capture handlers
  (keep the existing test, re-pointed).
- The dock is hidden when `showChrome(false)` and in card edit mode, and the
  toast moves to 78px.
- "Capturing…" disables both buttons and keeps the width.
- Toast text for each outcome: page, answer, video, PDF, failure, signed out,
  quota, declined, uncapturable.
- The "Add a set" sheet has all four options; paste text goes through the
  generation path once.

## Visual check
Harness at 390 × 884, dark mode: the dock on Home and Sets next to the
references; 360px and 320px widths; the "Capturing…" state; the Add a set
sheet.

## Report
As in README rule 12, including what you reused from prompt 33.
