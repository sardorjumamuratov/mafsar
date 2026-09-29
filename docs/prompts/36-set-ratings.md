# 36 — Star ratings on sets

**Depends on:** **35** (Global library)
**Branch:** `feat/set-ratings`
**Touches:** `server/src/db.ts` (migration), `server/src/sync.ts`, `server/src/schema.ts`, `server/src/app.ts`, `shared/sync-map.js`, `src/ui/views/sets.js`, `src/ui/views/set-detail.js`, `src/ui/views/global.js`, `src/ui/panel.css`

You decide the implementation and write your own tests (test first). Follow
`AGENTS.md` in full. Commit only source and test files, with no scratch scripts
and no copies of this prompt. Check `git status` before committing.

## What the learner wants

> Every set should have a star rating. It shows in my sets and in the global
> sets, and both sync. Global sets are ordered by category first, then by most
> stars.

## What a rating means

- **Your rating (1–5 stars)** can be given to any set in your sets. It's part
  of the set, so it **syncs across your devices** like the title or exam date.
  It rides on the existing set row in `/v1/sync` (`shared/sync-map.js`,
  `server/src/sync.ts`), with last-write-wins on `updatedAt`, exactly like
  `chainOverrides` did in prompt 27. Clearing it back to "no rating" must sync
  too.
- **If the set came from Global** (the link prompt 35 keeps), your rating also
  counts toward that global set's score. The server does this when the set row
  arrives, so there's no second write path to forget. One vote per account per
  global set. Changing or clearing your rating changes or removes your vote.
  Deleting your copy removes your vote.
- **You can't rate your own published set** into its global score. For your own
  set, the rating stays personal.
- **The global score** is shown as average stars and the number of ratings.
  "★ 4.6 · 23".

## What must be true when you're done

1. **Your sets list** shows your stars on each row (empty outline if unrated).
   For a set you published, it shows the global score instead, read-only,
   labelled so it's clear it's everyone's rating.
2. **Set detail** has a rating control: five stars in the header area, tap to
   set, tap the same star again to clear. Keyboard: arrow keys change it, and
   it's announced as "3 of 5 stars" (a radio group or slider pattern). A
   rating is prompted gently after the learner's first finished review of a
   set from Global, and never again for that set.
3. **Global** shows the score on every card and in the preview, plus the
   learner's own stars if they've added it.
4. **Ranking uses rating properly.** Replace prompt 35's "most added" within each
   interest group with a **Bayesian average**, so a set with one 5-star vote
   doesn't beat one with 200 votes averaging 4.8. For example
   `(v·R + m·C) / (v + m)`, with `C` the mean across all global sets and `m`
   around 5 to 10. Add count breaks ties. Order stays: learner's categories
   first, then everything else.
5. **Scores are computed on the server** and can't be pushed by a client. The
   sync schema accepts only an integer from 1 to 5, or null, for the learner's
   own rating. A vote for a hidden or unpublished global set is kept but not
   shown. Rating is rate-limited like other writes.
6. **Old clients and the mobile app don't break.** A set row without a rating
   must not clear an existing one (use the same `COALESCE`-style guard as
   `chain_overrides`), and a round-trip through the mobile app's sync must keep
   it. Showing stars in the mobile app is out of scope, but losing them there is
   a bug.
7. **Looks right:** stars use the theme's colour tokens, work in dark mode,
   have 44 px touch targets in set detail, and are compact (display-only) in
   lists.

Migrations: append at the end, fingerprint and count as in 34/35.

## Definition of done

- Rate a set on one device: the stars appear on another after sync, and clearing
  them syncs too.
- Account B rates an added global set 4 stars: Account A (the owner) sees "★ 4.0
  · 1" in their Sets list. B changes it to 2, and A sees "★ 2.0 · 1". B deletes
  the copy, and the vote is gone.
- A set with 1 × 5 stars ranks below one with 40 votes averaging 4.7 in the same
  category.
- **Tests cover:** sync round-trip and clear; `COALESCE` guard (a row without
  a rating keeps it); one vote per account; no self-vote; vote removed on
  delete; Bayesian ordering; schema rejects 0, 6, 2.5 and strings; the
  keyboard behaviour of the control.
- Everything in "Verify" passes, plus `cd mobile && npm run typecheck && npm test`.

## Verify

```bash
for f in tests/*.test.mjs; do node "$f" > /dev/null || echo "FAIL $f"; done
npm run typecheck
node tools/build.mjs
(cd server && npx vitest run && npx tsc --noEmit)
(cd mobile && npm run typecheck && npm test)
```

## Report

- **How a rating flows:** device → sync → global score.
- **The ranking formula** and the `m` you chose.
- **Files changed,** one line each.
- **Tests:** failing output first, then passing.
- **Which manual checks you ran.**
