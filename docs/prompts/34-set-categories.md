# 34 — Every set gets a category (server only)

**Depends on:** —
**Branch:** `feat/set-categories`
**Touches:** `server/src/db.ts` (migration), `server/src/llm.ts`, `server/src/app.ts`, a new `server/src/categories.ts`, `server/src/privacy.ts`

You decide the implementation and write your own tests (test first). Follow
`AGENTS.md` in full. Commit only source and test files, with no scratch scripts
and no copies of this prompt. Check `git status` before committing.

## Why

Prompt 35 adds a Global library of sets that learners publish, and shows each
learner the ones that match their interests. That needs to know what every set
is about, both published sets and each learner's own sets (their own sets are
how we learn their interests). This prompt adds that label. **It is
backend-only:** it's never sent to the extension or the app, and never shown to
anyone.

## What the label is

Two parts, both chosen by the AI:

- **`category`**: exactly one value from a fixed list in
  `server/src/categories.ts`. It has to be a fixed list: free-form names
  fragment ("Cardiology", "cardio", "Heart medicine") and nothing would ever
  match. Start from this list, and change it if you have a good reason (say
  why in your report):
  `medicine, nursing, dentistry, pharmacy, biology, chemistry, physics,
  mathematics, statistics, computer-science, programming, system-design,
  data-science, engineering, economics, business, finance, accounting, law,
  history, geography, politics, philosophy, psychology, sociology, education,
  languages, literature, arts, music, test-prep, other`.
- **`topic`**: a short name the AI writes itself, 2 to 5 words, e.g.
  "Renal physiology" or "Python async I/O". It's used to rank within a
  category (prompt 35).

## What must be true when you're done

1. **Sets carry the label on the server.** Add a migration with `category` and
   `topic` columns on `sets` (plus an index on `category`), or a separate
   table. Append it at the **end** of `MIGRATIONS`, add its fingerprint to
   `server/tests/migrations.test.ts` and bump the count in `schema.test.ts`.
   **Collision warning:** the unmerged branch `feat/usage-counts` also appends
   one at slot 017. Build on current `main`. Whichever branch merges second
   moves to the next free slot at integration (`docs/integrating.md`). Say in
   your report which slot you took.
2. **New sets are labelled for free.** `/v1/generate` already sends the whole
   source to the model. Ask for `category` and `topic` in that same call. Never
   add a second call per generation. The label must reach the set's server row
   even though the set itself arrives later, through `/v1/sync`: the client
   can send the set id (`sessionId`) with the generate request, and the server
   keeps the label until that set's row appears. Or pick a better way and
   explain it. It must not come back in the generate response, and it must not
   go into any sync payload.
3. **Every other set gets labelled in the background.** Imports (Quizlet,
   Anki, shared codes), sets made before this change, and sets whose label was
   lost. A background job labels unlabelled sets from their title and a sample
   of card fronts, several sets per model call. It **must stay within the
   model provider's rate limit:** the Groq free tier allows 8000 tokens a
   minute, counting the completion budget, and it's shared with learners'
   generations. So keep the job small, spaced out, and first to back off on a
   429. A learner's generation must never wait behind it. Say what budget you
   chose.
4. **The model's answer is checked.** A category not on the list becomes
   `other`. A topic is trimmed, capped in length, and stripped of anything that
   isn't plain text. A set whose cards change a lot (regenerated, or most cards
   replaced) is labelled again. Say how you detect that.
5. **Never exposed.** Nothing in any response to a client includes `category`
   or `topic`: not `/v1/sync`, not `/v1/share/:code`, not an error. Add a test
   that proves it. (Prompt 35 is the first thing allowed to use it, and only to
   order results.)
6. **Privacy.** Update `server/src/privacy.ts`: we label each set's subject
   with the same model provider that already writes its cards, to recommend
   relevant sets. No new third party.

Out of scope: any UI, the mobile app, the Global library itself (prompt 35).

## Definition of done

- Generate a set: its server row gets a category from the list and a topic,
  with no extra model call.
- An imported set is labelled within a few minutes by the background job, which
  backs off on a 429.
- **Tests cover:** list validation (unknown → `other`); the label reaches the
  row whether the generate or the sync arrives first; the background job batches
  and backs off; relabelling after big changes; no client response ever
  contains the fields; the migration fingerprint.
- Everything in "Verify" passes.

## Verify

```bash
for f in tests/*.test.mjs; do node "$f" > /dev/null || echo "FAIL $f"; done
npm run typecheck
node tools/build.mjs
cd server && npx vitest run && npx tsc --noEmit
```

If you have a key, run one real generation by passing it inline on the command
line (never write it to a file), and paste the category and topic it produced.

## Report

- **How a new set gets its label,** and how the background job works (batch
  size, spacing, back-off).
- **The migration slot** you used.
- **Files changed,** one line each.
- **Tests:** failing output first, then passing.
- **What you couldn't verify** (real provider behaviour, production).
