# Redesign 06: Edit cards in place (mock 3a)

**Depends on:** 03
**Branch:** `redesign/06-inline-edit`
**Reference:** `docs/design/reference/03-set-detail.html` (the card-editing state)
**Read first:** `docs/prompts/redesign/README.md` and `AGENTS.md`.
**Touches:** `src/ui/views/set-detail.js`, `src/ui/panel.js`, `src/ui/panel.css`

Replace the separate card editor with in-place editing inside Set detail's card
list. Tapping Edit turns the expanded card itself into editable fields, with
no navigation and no modal. **If prompt 32's in-row editor exists, restyle and
extend it to this spec, and delete what it leaves behind** (the old
`editForm` block and `paintAddCard`).

## The states of a card row
Collapsed → Expanded (03: answer panel plus Edit / Delete) → **Editing** (new).

## The editing state (replaces the row's content where it sits)
- Container: margin 8px 0 12px, padding 12, radius 14, background bg.surface
  (#141d1b), 1px border in accent (#34bcad), column, gap 12.
- **Field 1:** the label "QUESTION" (12px / 600 / uppercase / letter-spacing
  0.04em / text.muted, a real `<label for>`), gap 6, then a textarea.
- **Field 2:** the label "ANSWER", same style, then a textarea.
- **Textareas:** background bg.app (#0e1513), 1px border.control, radius 10,
  padding 10px 12px, text.primary, font inherited. The question is 15px /
  line-height 1.4 and the answer 14px / line-height 1.45. `resize: none`. They
  auto-grow to fit their content (minimum 2 rows, no inner scroll bar). Focus
  makes the border accent, with no outline glow. (This is the one place the
  global focus ring is replaced, because the accent border does its job.)
- Focus the question field automatically on entering edit mode, with the caret
  at the end of the text.
- **Action row:** flex, align centre, gap 8.
  - Left, flex 1: a hint at 12px / text.faint. When a field is empty: "Both
    fields are required". Otherwise "⌘ Enter to save" on a Mac and "Ctrl Enter
    to save" elsewhere. Hide it on touch-only devices (`(hover: none) and
    (pointer: coarse)`). *Added:* over the server's length limit for a card
    field (see `server/src/schema.ts`): "Too long: {n} / {max}".
  - **"Cancel":** height 40, padding 0 14, radius 10, 1px border.control,
    transparent, text.primary, 14px / 600.
  - **"Done":** height 40, padding 0 18, radius 10, no border, background
    accent, text accent.on, 14px / 650. Disabled (45% opacity, not clickable,
    `aria-disabled`) when either trimmed field is empty or too long.

## Behaviour
- **Done:** trims both fields, saves optimistically (`updateCard`, which syncs
  later), leaves edit mode, and shows the card Expanded with the new text. Then
  the Toast "Card saved". If the save fails, restore the old text and show the
  Toast "Couldn't save · Retry" (Retry saves again). If nothing changed, leave
  edit mode with no write and no toast.
- **Cancel or Esc:** discard the changes with no confirm, and return to
  Expanded. Focus returns to that card's Edit button.
- **⌘/Ctrl + Enter** in either field: same as Done. **Enter** alone inserts a
  new line (answers can be several lines).
- **While one card is editing:**
  - All other rows drop to 40% opacity and ignore taps (`inert`).
  - The capture dock is hidden.
  - The split study button stays visible but is disabled.
  - *Added:* the Cards/Summary tabs, Back, Share and More are also inert, so the
    learner can't lose the edit by accident. The bottom nav stays usable;
    tapping it with unsaved changes asks "Discard your edit?" (`confirmSheet`,
    "Discard" / "Keep editing").
- Only one card can be in edit mode at a time.
- **Editing doesn't reset the card's review schedule.** If the answer changed
  by more than 50%, show the Toast "Card saved · Reset progress?" with a
  "Reset" action instead of the plain one. "Changed by more than 50%" means
  `levenshtein(old, new) / max(old.length, new.length) > 0.5` on the trimmed
  answers. Reset sets the card back to New with `initSchedule()` from
  `shared/srs.js`, as a second write.
- **A background sync never wipes an open editor.** Prompt 31's repaint must
  treat edit mode as "busy". Test it.
- **Global sets** (prompt 09): the owner's edits update the global version.
  Edits by someone who added a copy change only their copy, and that copy stops
  receiving the owner's updates for that card. 09 defines the mechanism
  (`originCardId`, `detached`). Before 09 lands, there's nothing to do here.
- **"Add card"** (the list-header button) uses the same editing container,
  inserted at the **top** of the list with both fields empty. Done creates the
  card (`addCard`) and it appears in its group. Cancel removes the empty row. The
  hint shows "Both fields are required" from the start.
- **Link cards** (chains) never enter edit mode (see 03).

## Tests (write first)
- The editor renders inside the row, and there's no separate edit block.
- Done saves the trimmed text; unchanged text writes nothing; Cancel and Esc
  write nothing and return focus.
- Done is disabled for empty or too-long fields; the hint text matches each
  case, and Mac versus other platforms.
- ⌘/Ctrl+Enter saves; Enter adds a line.
- While editing: other rows inert at 40%, dock hidden, split button disabled.
- The reset threshold: 49% gives the plain toast; 51% gives the Reset toast,
  and Reset calls `initSchedule`.
- A sync landing mid-edit doesn't repaint.
- Add card: the row sits at the top, Cancel removes it, Done adds the card.

## Visual check
Harness at 390 × 884, dark mode, next to the editing state in
`03-set-detail.html`: editing an existing card, Add card, the disabled Done,
and a long answer growing the textarea.

## Report
As in README rule 12.
