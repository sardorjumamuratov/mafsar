# Redesign 13: Everything else gets the new look

**Depends on:** 00 (run after 03, before 04)
**Branch:** `redesign/13-restyle-remaining`
**Reference:** none of these screens has a mock. Use the components and tokens from 00, and the patterns in `03-set-detail.html` and `01-home.html`.
**Read first:** `docs/prompts/redesign/README.md` and `AGENTS.md`.

*Added: this prompt isn't in the original design document.* The document
designs five screens, but Mafsar has many more. Without this step, the
old-looking screens would sit next to the new ones, still held together only by
00's aliases. This prompt converts them to the new components and tokens.
**It doesn't change their layout or behaviour.** Where a screen needs a real
redesign, list it in the report instead of improvising one.

## The mapping (use it everywhere below)

Every value here comes from a component the design *does* specify. None is
new.

| Old | New | Where the values come from |
|---|---|---|
| `.btn-primary` | height 50, radius 12, background accent (hover accent.hover), text accent.on, 15px / 650 | the sheet's primary buttons (02 §4) |
| `.btn-ghost` (block) | height 44, radius 12, 1px border.control, bg.surface, text.primary, 14px / 600, hover border.hover | the dock buttons (05) |
| `.btn-sm`, `.linkbtn` | OutlineButton: height 36, padding 0 12, radius 10, 13px / 600 | 03 §6a |
| `.iconbtn` | IconButton | 00 |
| `.block`, cards | padding 16, radius 16, bg.surface, 1px border.card | Home cards (01) |
| `.block.tint`, `.help`, info notes | callout: padding 12px 14px, radius 12, bg.surface2, 14px / line-height 1.45 / text.secondary | 03 §8 |
| `.field input`, `select` | height 44, padding 0 14, radius 12, bg.surface, 1px border.card, 15px, text.primary; focus border border.hover | the search field (02) |
| `.field textarea` | bg.app, 1px border.control, radius 10, padding 10px 12px, 15px / line-height 1.4; focus border accent | the editor (06) |
| `.field label`, `.t-label`, `.listhd` | SectionLabel | 00 |
| `.setting-row` | padding 14, radius 14, 1px border.control, transparent, gap 12; title 15px / 600, sub 13px / text.muted, 16px chevron-right #6d7c78 | the "Send feedback" row (10 §7) |
| checkboxes / toggles | a switch: 40×24 track, radius 12, off = border.control fill, on = accent; 18px knob, text.primary off / accent.on on; the whole row toggles it | *new pattern, flag it in the report* |
| `.tag`, `.pill` | CountBadge, or the source chip style for coloured ones | 00, 03 §2 |
| `.seg` | the segmented tabs | 03 §5 |
| `.bar` | 6px track #27322f, radius 3, fill accent (mastered fills: status.mastered) | 01 §4 |
| view titles `.h-title` | 24px / 650 / −0.02em, as an `<h1>` | 01, 02 |
| `.empty` | centred, padding 28px 12px, 14px / text.muted | 02 §5 |
| spinners and skeletons | skeleton blocks in bg.surface2 with a gentle opacity pulse (none with reduced motion) | README rule 6 |

## Screens
1. **You** (`views/you.js`). Header "You" (the 24px title pattern) instead of
   the wordmark. The account block, the plan and billing block with its meters,
   the sign-in form (Google button, email and password), Layout ("Open Mafsar
   in a tab"), Backup, Delete account, and the update banner. Add a **Teams**
   row (the `.setting-row` pattern, a people icon in accent.text, sub "Study
   with a group") that opens the Teams screen, if 00 didn't already. The old
   streak and three stat tiles leave You: Stats has its own tab now. In their
   place goes a `.setting-row` "Your stats" (sub "{n}-day streak · {mastered}
   mastered") that opens the Stats tab.
2. **Teams** (`views/teams.js`): the team list, create and join forms, and
   member stats. Back returns to You.
3. **Import** (`views/import.js`): the paste and import view, and the
   shared-code form (until prompt 05 moves it into the "Add a set" sheet).
4. **Focus views**, all of them (`flows/*.js`): review, typed answers, quiz,
   teach it back, coding, design drill, estimation, find the bottleneck, chain
   drill, clinical case, compare. Use one header pattern: an IconButton close
   "×" on the left (`aria-label="End session"`), a 4px progress track (#27322f,
   fill accent, radius 2) in the middle, and a count at 13px / text.muted on
   the right. Card faces use the card pattern at radius 16. Grade buttons use
   the `.btn-ghost` mapping with coloured text: Again danger.text, Hard
   status.learningText, Good accent.text, Easy status.mastered. Their
   behaviour, keyboard shortcuts and hints don't change.
5. **Generating screen** (`makeSet` in `set-detail.js`) and the capture
   progress states: the steps list with tokens (done = status.mastered check,
   running = an accent ring, waiting = border.control ring).
6. **Delete account** (`views/delete-account.js`) and every `confirmSheet`: the
   BottomSheet from 00, with destructive confirm buttons at height 50, radius
   12, background danger.text, text #0e1513 (dark theme; in light, white text).
7. **The update banner and error states:** the callout pattern, with the action
   as an OutlineButton in accent.text.

## Not in scope
The content scripts (the "Save to Mafsar" button injected into chat pages),
the landing page, and the mobile app.

## Tests (write first)
- No old variable name (`--primary`, `--ink`, …) is used outside 00's alias
  block. After this prompt, the alias block can be deleted (prompt 04 does it).
- Every view renders with no hex colour in inline styles (a static scan of
  `src/ui/**/*.js` for `#[0-9a-f]{3,6}` inside style strings, except `icons.js`).
- Teams is reachable from You; "Your stats" opens Stats.
- Focus-view headers all have an "End session" button.

## Visual check
Harness at 390 × 884, dark and light: You (signed in and signed out), Teams,
Import, one review, one drill, a confirm sheet. There are no references, so
the check is consistency with the redesigned screens. Say what you looked at.

## Report
As in README rule 12, plus a list of screens that need a real design, not
just new tokens.
