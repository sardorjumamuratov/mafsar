# 32 — Edit a card where it is

**Depends on:** —
**Branch:** `feat/inline-card-edit`
**Touches:** `src/ui/views/set-detail.js`, `src/ui/panel.js`, `src/ui/panel.css`

You decide the implementation and write your own tests (test first). Follow
`AGENTS.md` in full. Commit only source and test files, with no scratch scripts
and no copies of this prompt. Check `git status` before committing.

## The report

> Editing a card opens a separate box somewhere else on the page. I want to tap
> Edit and just type into the card, then tap Done.

## What the code does now

In the Flashcards tab of `src/ui/views/set-detail.js`, the pencil on a card row
(`data-action="card-edit"`) sets `editingCardId` and repaints the whole view.
`paintDetail()` then renders a separate `editForm` block **above the card list**,
under the mastery counters, far from the row the learner tapped. On a long set
that block is off-screen, so nothing seems to happen. `edit-save` /
`edit-cancel` in `src/ui/panel.js` close it.

The row itself shows only the front. `＋ Card` (`promptAddCard` /
`paintAddCard`) has the same problem: it inserts a form above the buttons at the
bottom rather than a new card in the list.

## What must be true when you're done

1. **Edit happens in the row.** Tapping the pencil turns *that* row into an
   editor: front and back text areas in place of the row's text, with **Done**
   (primary) and **Cancel**. Nothing else on the page moves, and the view does
   not scroll or jump. The separate `editForm` block is gone.
2. **Text areas fit their text.** They grow with the content (no inner scroll
   bar for a normal card) and start with the caret at the end of the front.
3. **Keyboard works the way people expect.** Ctrl/Cmd+Enter is Done. Esc is
   Cancel. Plain Enter makes a new line. Tab moves from front to back to Done.
4. **Done saves. Cancel really cancels.** Done calls the existing `updateCard`
   and shows the row again with the new text. Nothing is written if the text
   didn't change. Cancel restores the original text with no write.
5. **An empty front is caught at the field**, with an inline message under it
   and focus kept there. No toast for this.
6. **One card at a time.** Tapping Edit on another card while one is open
   commits the open one first, the same as Done (or keeps it open with the
   inline error if the front is empty).
7. **Focus comes back.** After Done or Cancel, focus returns to that row's
   pencil button, so keyboard and screen-reader users don't lose their place.
   The editor has accessible labels ("Front", "Back").
8. **A background sync can't wipe a half-written edit.** Prompt 31's repaint
   already holds off while a text area has input. Confirm it covers the in-row
   editor, and add a test.
9. **`＋ Card` works the same way.** It adds a new empty row at the end of the
   list, already in edit mode, and scrolls it into view. Cancel removes it. Done
   calls `addCard`.
10. **Link cards stay read-only.** Rows made from a mechanism chain keep their
    "chain" tag and have no pencil, as today.
11. **It looks like part of the card,** not a pasted form: same row padding and
    radius, a subtle focus ring, and works in dark mode, at the narrow side-panel
    width and in the wide tab layout (prompt 23). Motion respects
    `prefers-reduced-motion`.

Out of scope: the mobile app, quiz-question editing, the Chains tab editor.

## Definition of done

- Tap Edit on the 30th card of a long set: the editor opens in that row, on
  screen, and Done saves it there.
- **Tests cover:** the editor renders inside the row (not a separate block);
  Done calls `updateCard` with the new text; unchanged text writes nothing;
  Cancel writes nothing; an empty front shows the inline error; opening a second
  card commits the first; link cards have no pencil; `＋ Card` adds an editing
  row; the no-`innerHTML` rule still holds.
- Everything in "Verify" passes.

## Verify

```bash
for f in tests/*.test.mjs; do node "$f" > /dev/null || echo "FAIL $f"; done
npm run typecheck
node tools/build.mjs
cd server && npx vitest run && npx tsc --noEmit
```

Then by hand with `dist/chrome` loaded unpacked: edit, cancel and add cards with
the mouse and with only the keyboard, in light and dark mode, in the side panel
and in a tab.

## Report

- **How editing works now,** in a few lines.
- **Files changed,** one line each.
- **Tests:** failing output first, then passing.
- **Which manual checks you ran.**
