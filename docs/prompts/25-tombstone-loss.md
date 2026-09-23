# 25 — Saving a set destroys its delete tombstones

**Depends on:** 21 (it moved the storage accessors). **Branch:** `fix/tombstones`
**A data bug, and it predates all the recent features.**

You decide the implementation and write your own tests (test first). Follow
`AGENTS.md` in full. Commit only source and test files, with no scratch scripts
and no copies of this prompt. Check `git status` before committing.

## The bug

Deletes are tombstones, never removals, so they can propagate: `deleteCard` sets
`deleted: true` and bumps `updatedAt` (`src/storage/store.js`). The sync layer
sends those rows; other devices apply them.

But the readers hide them. `getStudySets` and `selectStudySets` both filter
`(s.flashcards || []).filter((c) => !c.deleted)`, and the panel reads through
`bundle()` → `setFor()`. Several call sites then hand that **filtered** object
straight back to `saveStudySet`, which writes it as the whole record:

- `src/ui/flows/chains.js` (editing a chain step, and dismissing the medicine suggestion)
- `src/ui/panel.js` (the set-mode switch)
- `src/ui/flows/compare.js` (overrides and fork cards)
- `src/ui/share.js` (two call sites)
- `src/ui/views/set-detail.js`

Every tombstone in that set is erased from storage. The delete then stops
syncing, and the next pull from a device that still has the card brings it back.
Deleting a card and editing a chain in the same sitting is enough to trigger it.

## What must be true when you're done

1. **A save can't drop a tombstone.** Fix it where it cannot be reintroduced —
   a call site that forgets the rule should still be safe. The obvious shape is
   for `saveStudySet` to merge what it's given over the *stored* record rather
   than replacing it, so rows the caller never saw survive; if you choose a
   different shape, justify it.
2. **A real delete still works.** Tombstoning a card, then saving the set from a
   filtered read, must leave the card deleted — not resurrect it. This is the
   trap in the obvious fix: "keep rows the caller didn't send" and "honour a row
   the caller deleted" have to both hold. Rows carry `updatedAt`; use it.
3. **Nothing else changes shape.** `saveStudySet` is called from the worker
   (capture, regenerate), the panel, import, and share; all of them keep working,
   including the link-card sync it already does (`syncLinkCards`).
4. **A guard test** that fails if a new call site writes a filtered set back.
   Static is fine — the pattern is `bundle()`/`setFor()` into `saveStudySet` —
   as long as it would catch the next one.

## Definition of done

- **Tests cover:** a tombstone surviving a save from a filtered read, a delete
  made through the filtered read still taking effect, a quiz-row tombstone (the
  same filter applies to `quiz`), and the guard.
- Everything in "Verify" passes.

## Verify

```bash
for f in tests/*.test.mjs; do node "$f" > /dev/null || echo "FAIL $f"; done
npm run typecheck
node tools/build.mjs
cd server && npx vitest run && npx tsc --noEmit
```

## Report

- **Where you put the fix and why there.**
- **How you kept deletes working** while keeping unseen rows.
- **Files changed,** one line each.
- **Tests:** failing output first, then passing.
