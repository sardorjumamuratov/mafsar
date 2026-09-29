# Redesign 04: QA pass for Home, Sets, Set detail (and the rest)

**Depends on:** 01, 02, 03, 13
**Branch:** `redesign/04-qa`
**Reference:** `docs/design/reference/01-home.html`, `02-sets.html`, `03-set-detail.html`
**Read first:** `docs/prompts/redesign/README.md` and `AGENTS.md`.

Audit Home, Sets and Set detail (and the screens from 13) against the spec,
and fix every difference. Write a test for each item that can be tested
statically. Report each item as ✅ or fixed, with how you checked it.

## From the design document
- Geist is loaded and applied everywhere, and no fallback font shows on first
  paint. It's the bundled file; nothing is fetched from Google.
- Every colour comes from the 00 tokens, with no leftover old greys or teals.
  Search the code for hex values that aren't in the token list.
- No raw "User hh:mm AM" text appears in any title, on any screen.
- **The nav is Home, Sets, Discover, Stats, You, with no raised play button.**
  (The original checklist said "the centre tab is Review". That contradicts 00,
  which removes the Review tab. The centre tab is **Discover**.)
- Tap targets are at least 40×40 (icon buttons) or 44px tall (the search field,
  rows).
- No 0% progress bars anywhere.
- Question text is never truncated to one line. Fading soon clamps at 2 lines;
  Set detail shows the full text.
- Delete → Undo restores the card in the same position, and counts update
  everywhere.
- The study mode persists across sets and restarts.
- Adding or editing an exam date works inline on both Home and Set detail;
  nothing redirects to another tab.
- Sheets close on an overlay tap and on Esc (the extension's "back gesture").
- Scrolling: only the content scrolls. The docked bars stay fixed, and the
  toast clears them (bottom 138px with the dock, 78px without).
- Screen-reader labels: "Back", "Share", "More", "Study mode", "How it works".
- Text contrast on bg.app is at least 4.5:1. text.muted #9aa9a4 is the lowest
  body colour allowed; text.faint is only for the nav, inactive tabs and hints.

## Added
- **The alias block from 00 is deleted,** and nothing uses an old variable name.
- **Light theme:** every screen is readable. Check the contrast of text.muted,
  accent.text and status.learningText on bg.app and bg.surface (≥ 4.5:1 for
  body text, ≥ 3:1 for 17px+ bold).
- **Widths:** 320, 360, 390 and 480 px. Nothing overflows horizontally, and
  nothing is clipped or overlaps. Long titles wrap.
- **Tab mode** (prompt 23): one centred 480px column, with the dock, nav,
  sheets and toast inside it.
- **Firefox sidebar:** load `dist/firefox`, open each screen, and check that
  the font, sheets and menu work.
- **Keyboard only:** every action can be reached with Tab. Focus is always
  visible (the 2px accent.text ring). Sheets trap focus and return it on close.
- **Reduced motion:** with `prefers-reduced-motion: reduce`, nothing slides,
  scales or rotates; things only fade.
- **Local-first:** with the network off, Home, Sets and Set detail paint from
  storage. The safety tests (`tests/ui-static.test.mjs`) are all still there
  and green.

## Report
A table of item | result | how checked, then README rule 12.
