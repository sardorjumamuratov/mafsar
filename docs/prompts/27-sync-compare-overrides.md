# 27 — The compare overrides never leave the device

**Depends on:** 19 (compare), 15 (chains). **Branch:** `feat/sync-chain-overrides`

You decide the implementation and write your own tests (test first). Follow
`AGENTS.md` in full. Commit only source and test files, with no scratch scripts
and no copies of this prompt. Check `git status` before committing.

## The gap

Comparing two chains marks each step as the same or a fork, guessed from word
overlap, and the learner can overrule the guess. That decision is stored on the
set as `chainOverrides` (`src/storage/compare.js`, written by
`toggleCompareSame` in `src/ui/flows/compare.js`).

`toServer` in `shared/sync-map.js` maps an explicit whitelist of set fields —
`title`, `source`, `mode`, `examDate`, `createdAt`, `updatedAt`, `deleted` — so
`chainOverrides` is never sent, and `applyServer` never restores it. The chains
themselves sync; the judgements about them don't. Open the same set on the phone
and every override is back to the guess, including on steps the learner has
already corrected.

## What must be true when you're done

1. **An override survives a round trip** through the server to another device,
   and back.
2. **Last-write-wins, like everything else.** Two devices disagreeing about one
   step resolves the same way the rest of sync does, on `updated_at`. Decide
   whether an override is part of the set row or a row of its own, and justify
   it: a per-pair-per-step row syncs more precisely but costs a table.
3. **Migrations are append-only.** Add to the `MIGRATIONS` list in
   `server/src/db.ts`; never edit or reorder an existing entry.
4. **Old clients keep working.** A client that sends no overrides must not have
   its existing ones wiped by the server, and a client that receives fields it
   doesn't know about must not break. Both directions matter — people will be on
   0.3.0 for a while.
5. **The mobile app still typechecks and passes**, whether or not you surface
   overrides there.
6. **Sets with no chains cost nothing:** no new rows, no new columns written for
   an ordinary set.

## Definition of done

- **Tests cover:** the round trip, last-write-wins between two devices, an old
  client not clobbering overrides, and a plain set being unaffected.
- Everything in "Verify" passes.

## Verify

```bash
cd server && npx vitest run && npx tsc --noEmit
cd ..
for f in tests/*.test.mjs; do node "$f" > /dev/null || echo "FAIL $f"; done
npm run typecheck
node tools/build.mjs
cd mobile && npm run typecheck && npm test
```

## Report

- **Where the override lives on the server**, and why that shape.
- **What an old client does** with the new field, proven by a test.
- **Files changed,** one line each.
- **Tests:** failing output first, then passing.
