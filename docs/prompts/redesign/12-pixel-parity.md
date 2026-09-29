# Redesign 12: Pixel-parity pass (run last)

**Depends on:** everything
**Branch:** `redesign/12-pixel-parity`
**Reference:** all files in `docs/design/reference/`, and `docs/design/App Screens.dc.html`
**Read first:** `docs/prompts/redesign/README.md` and `AGENTS.md`.

Compare each implemented screen against its reference at a **390 × 884**
viewport, in dark mode, with Geist loaded.

## How to render Mafsar at 390 × 884
Serve the repo root over HTTP and open `tests/harness/panel-harness.html` (it
loads the real panel with a `chrome.*` stub) in a browser window sized to 390 ×
884, next to the reference file at the same size. Seed the harness's stub
storage with data that matches the mock (the same set titles, counts, dates and
ratings), so the same text wraps the same way. Keep that seed as a fixture
under `tests/harness/`, so the next person can repeat the check.

**If you can't run a browser,** do steps 3 and 4 from the markup and CSS alone,
and say plainly that steps 1 and 2 weren't done. The integrator (Claude, with a
browser) will do them.

## Steps
1. **Screenshot every screen in the same state,** app and reference:
   - Home
   - Sets: default, and with the filter sheet open
   - Set detail: card 2 expanded; a card being edited; the study-mode menu
     open; the ⋯ menu; the Make-global confirm; the How-it-works sheet; the
     Summary tab
   - Discover: the list, and with the preview open
   - Stats: Week, Month, All time
2. **For each pair, check and fix until they match:**
   - Positions and sizes of every element, within ±1px.
   - Colours exactly equal (sample with a colour picker), with no leftover theme
     colours.
   - Typography: family, size, weight, line-height, letter-spacing and wrapping.
     The same text breaks onto the same lines.
   - Icons: the same path, size and stroke width.
   - Radii, borders, shadows, gaps.
   - States: hover, selected, disabled, open/closed, empty.
3. **Then compare computed styles.** Go through every computed style in the
   reference markup for these components, and confirm the implementation has
   the same computed value: SetRow; the SplitPrimaryButton and its menu; the
   card row (collapsed, expanded, editing); the capture dock; the BottomNav; the
   BottomSheet; the Toast; the segmented control; the search field and filter
   button; the star rating; the stat figures; the chart bars.
   - *Added:* do this with a small throwaway script run in the browser console
     against both pages (`getComputedStyle` on matching elements). **Don't
     commit it,** and add no dependencies.
4. **Output a table:** element | reference value | implemented value | fixed?.
   Every row must end as fixed. Where a difference is deliberate (a README rule,
   e.g. the bundled font file, tab mode, the light theme), mark it "by design"
   with the rule number instead.

## Also check
The added pieces that have no reference (the Exam sheet, Share sheet, Add a set
sheet, set-type menu items, feedback sheet, the empty, offline and signed-out
states, and 13's screens) use only 00's tokens and components. List them as
"no reference: tokens only" in the table.

## Report
The table, the screenshots you took (paths, not committed), and README rule 12.
