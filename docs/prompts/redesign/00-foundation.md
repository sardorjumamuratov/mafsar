# Redesign 00: Foundation (tokens, font, shared components, nav)

**Depends on:** —
**Branch:** `redesign/00-foundation`
**Reference:** `docs/design/reference/01-home.html` (nav, SetRow, section labels). Token values also appear in every reference file.
**Read first:** `docs/prompts/redesign/README.md` (rules 1–12) and `AGENTS.md`.

Update the design foundation to match the redesign exactly. **Don't change any
screen layouts yet.** Only add or replace tokens and shared components, and
switch the bottom nav. Use exactly the values below. Don't round them, and
don't swap in near-equivalents from the existing theme.

## Font
- Family "Geist", weights 400, 500, 600, 650 and 700, served from the bundled
  variable font (README rule 3, **not Google Fonts**). Fallback: `system-ui, sans-serif`.
- `-webkit-font-smoothing: antialiased` (and `-moz-osx-font-smoothing: grayscale`).
- Letter-spacing: −0.02em on screen titles (24–27px), −0.03em on hero numerals
  (52px), 0 everywhere else unless stated.

## Colour tokens (dark theme, the reference)

**Backgrounds**
| Token | Value | Used for |
|---|---|---|
| bg.app | #0e1513 | screen background |
| bg.nav | #0b1110 | bottom nav (and the capture dock, prompt 05) |
| bg.surface | #141d1b | cards, rows, inputs, answer panels |
| bg.surface2 | #1c2826 | icon tiles, count badges, info callouts, selected mode row |
| bg.sheet | #151e1c | bottom sheets, the study-mode menu |
| bg.segmentActive | #243230 | active segmented-control tab; secondary buttons in sheets |

**Borders**
| Token | Value | Used for |
|---|---|---|
| border.control | #27322f | icon buttons, outline buttons, chips, exam row, empty ring |
| border.card | #222c2a | cards, set rows, search field, segmented control |
| border.divider | #1e2826 | list dividers, dock top border |
| border.hover | #34514c | set row hover; selected rows |

**Text**
| Token | Value | Used for |
|---|---|---|
| text.primary | #e7eeec | |
| text.secondary | #cfd9d6 | emphasis inside muted lines, count badges |
| text.answer | #b9c6c2 | card answers |
| text.body2 | #a9b6b2 | secondary paragraphs, legends |
| text.muted | #9aa9a4 | meta lines, section labels (the lowest body colour allowed) |
| text.faint | #8b9a96 | inactive nav, inactive tabs, search icon, hints (nothing else) |

**Accent**
| Token | Value | Used for |
|---|---|---|
| accent | #34bcad | primary buttons, Home hero background |
| accent.hover | #45cbbc | |
| accent.on | #04211d | text and icons on accent |
| accent.text | #5fd3c5 | accent-coloured text, links, active nav, focus ring |
| accent.dot | #3cc4b4 | dot inside the source chip |
| accent.chipBg | #133a35 | |
| accent.onWhite | #16786e | text of the white hero button; Undo in the toast |
| accent.pressed | #2aa396 | the split button's chevron while its menu is open (prompt 03) |

**Status**
| Token | Value | Used for |
|---|---|---|
| status.new | #6d7c78 | New dot |
| status.newBar | #3b4845 | New segment of the progress bar; sheet grabber |
| status.learning | #e3a246 | amber: Learning, "fading" dots |
| status.learningText | #e3a246 | amber text: due counts (differs in light, README rule 4) |
| status.mastered | #45c483 | |
| danger.text | #f08a7a | Delete text and icon |

**Rating and charts** (these come from round 3; add them now so there's one token file)
| Token | Value | Used for |
|---|---|---|
| rating.star | #f0c75e | filled star (never the amber #e3a246, which means "due") |
| rating.empty | #6d7c78 | empty-star stroke |
| chart.bar | #2c4a46 | bars for past periods |
| chart.zero | #1e2826 | bars for zero values |
| track | #27322f | progress-bar tracks (the same value as border.control; kept separate so the two can diverge) |

**Source tiles** (background / foreground, label)
| Source | Tile | Label |
|---|---|---|
| AI Studio | #133a35 / #5fd3c5 | AI |
| YouTube | #3a1f1d / #f08a7a | YT |
| ChatGPT | #1f2a28 / #cfd9d6 | GPT |
| Quizlet | #1c2540 / #8fa8f0 | Q |

*Added, not in the design:* Mafsar has more sources than the four in the
mock. They all use the **neutral ChatGPT colours** (#1f2a28 / #cfd9d6). No
new colours. Labels: Claude `CL`, Gemini `GEM`, PDF `PDF`, a web page
(`web`, `generic`) `WEB`, a paste import (Anki/CSV) `CSV`, shared code `SH`,
pasted text `TXT`, a set created empty `ME`. A copy added from Discover shows
its original's tile. Put the mapping in one function next to `sourceLabel()`
in `core.js`.

**Overlay and toast**
- overlay: rgba(0,0,0,0.6)
- toast.bg #e7eeec, toast.text #0e1513, toast shadow `0 8px 24px rgba(0,0,0,.4)`

**Light theme:** the derived table in README rule 4. Nothing else in the
stylesheet uses a raw hex value.

**Old variables:** the current stylesheet's variables (`--primary`, `--ink`,
`--muted`, `--surface`, `--border`, `--warm`, `--success`, `--faint` and the
rest) become **aliases** to the nearest new token, so screens that haven't been
rebuilt yet still look coherent. Prompt 13 converts those screens and prompt 04
deletes the aliases. List the mapping in your report.

## Icons
24×24 line icons: `stroke="currentColor"`, round caps and joins, `fill="none"`
unless the icon is filled. Stroke width 2 unless noted. Sizes: 18px in icon
buttons, 20px in the nav, 14–16px inline in buttons. **Copy the paths from the
reference** into `src/ui/icons.js` (README rule 1).

## Shared components

1. **IconButton.** 40×40, radius 12, 1px border.control, transparent
   background, 18px icon in text.primary, centred. Used for Back
   (chevron-left), Share (a tray with an up arrow) and More (three filled dots,
   r=1.8). Always has an `aria-label`.

2. **SectionLabel.** 13px, weight 600, UPPERCASE, letter-spacing 0.04em,
   text.muted. An optional right-side action link: 14px / 600 / accent.text,
   a real `<button>`. Header row: flex, space-between, align centre, padding
   0 4px.

3. **CountBadge.** A pill: padding 1px 7px, radius 999, bg.surface2,
   12px / 600 / text.secondary.

4. **PrimaryButton.** Height 54, radius 14, no border, background accent
   (hover accent.hover), text accent.on, 16px / 650. Content row with gap 10:
   a filled play-triangle icon 16px, then the label, then "· {meta}" at weight
   500 and 70% opacity. *Added:* disabled = 45% opacity and `cursor: default`.

5. **SplitPrimaryButton** (set detail). Two buttons in a row with a 2px gap.
   - Left: flex 1, PrimaryButton styling, radius 14 4 4 14.
   - Right: 54×54, radius 4 14 14 4, the same accent background and hover, a
     chevron-down icon 18px with stroke 2.2. `aria-label="Study mode"`,
     `aria-haspopup="menu"`, `aria-expanded`. It opens the Study-mode menu
     (prompt 03, step 7).
   - Build it here, used in 03.

6. **OutlineButton (small).** Height 32–36, padding 0 10–12, radius 9–10,
   1px border.control, transparent background, 13px / 600, an optional 14px
   leading icon with gap 6. Each use states its exact height, padding, radius
   and colour; build it with those as parameters, not as one fixed size.

7. **BottomNav.** Height 64 (plus `env(safe-area-inset-bottom)`), background
   bg.nav. A grid of 5 equal columns, items centred, each a column with gap 3.
   - Items in order: **Home** (house), **Sets** (three horizontal lines),
     **Discover** (compass: circle r=9 plus a rotated diamond needle),
     **Stats** (three vertical bars of different heights), **You** (person).
   - Inactive: icon stroke 1.8, text.faint, label 11px / 400.
   - Active: icon stroke 2, accent.text, label 11px / 600. The active item has
     `aria-current="page"`.
   - **Remove the raised teal play button in the centre.** There's no Review
     tab any more. Review starts from Home's hero and from Set detail.
   - **Teams moves out of the nav into You,** as a "Teams" row that opens the
     existing Teams screen (prompt 13 restyles You; add the row now so Teams
     stays reachable).
   - The nav has **no top border of its own**. The capture dock (prompt 05)
     sits on top of it and carries the border. *Until the dock exists,* the nav
     gets a temporary 1px border.divider top border, which prompt 05 removes.

8. **BottomSheet** (`src/ui/sheet.js`, behaviour in README rule 7).
   - A full-screen overlay in the overlay colour. Tapping the overlay closes the
     sheet; taps on the panel don't propagate.
   - Panel at the bottom, full width, radius 22 22 0 0, background bg.sheet,
     1px top border border.control.
   - Grabber: 36×4, radius 2, #3b4845 (status.newBar), centred at the top.
   - Title: 18px / 650.
   - Content column with gap 16 (info sheet) or 6 (list sheet).
   - `confirmSheet()` in `src/ui/confirm.js` is rebuilt on this component, with
     the same API.

9. **Toast** (`core.js`'s `toast()`, extended to `toast(text, { action, onAction })`).
   - Absolute: left 16, right 16, 14px above whatever is docked at the bottom.
     That's bottom 138px when the capture dock (60px) and nav (64px) are both
     visible, bottom 78px when only the nav is visible, and bottom 16px in a
     focus view with no nav.
   - Height 48, radius 12, padding 0 8 0 16. Colours toast.bg / toast.text,
     14px / 500, flex space-between.
   - Trailing text button: height 36, padding 0 12, transparent background,
     accent.onWhite, 14px / 700.
   - Auto-dismisses after 4000ms. Any new toast replaces the current one and
     restarts the timer.
   - In tab mode it stays inside the 480px column.

10. **SetRow** (one `setRowHtml()` in `src/ui/views/sets.js` or a new
    `src/ui/set-row.js`, used everywhere).
    - A full-width `<button>`: flex, align centre, gap 12, padding 12, radius
      14, background bg.surface, 1px border.card. Hover: border becomes
      border.hover.
    - **Source tile:** 40×40, radius 10, source bg/fg colours, label 12px / 700,
      centred, doesn't shrink.
    - **Middle column:** flex 1, min-width 0, gap 3.
      - Title: 15px / 600 / line-height 1.3 / text.primary, through
        `cleanTitle()`. It wraps; no single-line truncation.
      - Meta line: flex, align centre, flex-wrap, gap 6, 13px / text.muted.
        Items in order: "{Source}"; then "· ★ {avg}{suffix}" if the set has a
        rating; then "· 🌐 Global" if it's global. The exact spec is in prompt
        07; until 07 lands, only "{Source}" shows. There's no "Not started"
        text.
      - Progress bar: only when mastery > 0, under the meta line. 4px tall,
        radius 2, track #27322f, fill status.mastered. Never show a 0% bar.
    - **Right column,** right-aligned: the due count at 17px / 700 /
      status.learningText, and under it "due" at 11px / text.muted.
      - *Added:* when due is 0, the right column shows a 16px check in
        status.mastered if mastery is 100%, and is **empty** otherwise. Never
        "0 due".
    - Accessible name: "{title}, {n} due" (or "{title}, all mastered").

11. **StatusDot.** An 8×8 circle. New #6d7c78, Learning #e3a246, Mastered
    #45c483. Decorative (`aria-hidden`); the state is also given in text
    wherever it matters.

## Added (not in the original document)

- **Discover and Stats tabs exist from now on,** before their screens are
  built in 09 and 10. Never show a blank screen:
  - **Discover:** the existing Global library view (prompt 35) if it's there.
    Otherwise a header ("Discover" 24px / 650 / −0.02em, and "Sets shared by
    other learners, picked for you" at 13px / text.muted) with one centred
    line at 14px / text.muted: "Shared sets are on their way."
  - **Stats:** prompt 10's empty state (header, the text, and a PrimaryButton
    "Start review").
- **Everything that opened the old Review tab** (the `review` nav handler, a
  reminder notification click, any shortcut) now starts the same session as
  Home's "Start review". Search for `data-nav="review"`, `"review"` in
  `panel.js`, and the notification click handler in `service-worker.js`.
- **Focus views** (review, quiz, drills, teach it back) still hide the nav with
  `showChrome(false)`.
- **Content clears the bottom bars:** the scroll container's bottom padding is
  the design value plus the height of whatever is docked (64 now, 124 once the
  dock lands), so the last row can always scroll into view.

## Tests (write first)
- Every token exists in both theme blocks, and there are no raw hex values
  outside them (a CSS scan).
- The nav has exactly five items in order (Home, Sets, Discover, Stats, You),
  no `.center` or raised button, and `aria-current` on the active one.
- Teams is reachable from You.
- `toast()` with an action renders the button, replaces an earlier toast, and
  auto-dismisses after 4000ms (fake timers).
- The BottomSheet traps focus, closes on Esc and on an overlay tap, and returns
  focus to the opener; `confirmSheet()`'s API is unchanged.
- `setRowHtml()` has no progress bar at 0% mastery, no "Not started", and the
  due-0 cases above.
- Geist is a local file: `panel.html`/`panel.css` reference `../vendor/geist/`,
  and nothing references `fonts.googleapis.com` or `fonts.gstatic.com`.

## Visual check
In the harness at 390 × 884, dark mode: the nav and one SetRow next to
`01-home.html`. Check the nav at 320px width too.

## Report
As in README rule 12, plus the old-to-new variable alias mapping.
