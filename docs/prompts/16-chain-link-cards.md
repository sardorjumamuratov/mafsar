# 16 — Medicine: link cards in daily review

**Depends on:** 15. **Branch:** `feat/chain-link-cards`

You decide the implementation and write your own tests (test first). This file
says **what** to build and the rules. Follow `AGENTS.md` in full. Commit only
source and test files, with no scratch scripts and no copies of this prompt.
Check `git status` before committing.

## Why

Understanding lives in the arrows. A student who knows every step of the asthma
chain but not **why** bronchoconstriction makes exhaling hard hasn't learned
asthma. Reviewing the links, on the same spaced-repetition schedule as
everything else, is what makes the chain stick.

## What the learner experiences

- **Link cards in the normal review.** In Medicine sets, each link in a chain
  (step A → step B) becomes a card that shows up in the normal daily Review,
  mixed with the set's other cards. Two shapes, chosen by you per link:
  - **next step:** "Bronchoconstriction + mucus → ?" with the back "Narrowed
    airways", plus the why.
  - **why:** "Why does airway inflammation lead to wheezing?" with the back being
    the why statement.
- **Recognisable context.** A link card shows the condition name and a thin
  breadcrumb of where it sits in the chain (for example "Asthma · Change →
  Symptoms"), so it isn't a free-floating fact.
- **Grading as usual.** Again / Hard / Good / Easy, scheduled by the existing
  FSRS scheduler (`shared/srs.js`). Weak links come back sooner. Nothing new to
  learn.
- **"Needs work" names links.** A weak link appears there like a card, and
  tapping it opens the chain with that link highlighted.
- **They follow the chain.** Editing a chain step (prompt 15) updates the link
  cards that depend on it. Adding a missing step creates its links. A link card
  whose text changed substantially should be treated as new for scheduling;
  decide what "substantially" means and test it. Deleting a chain retires its
  link cards.
- **Available on the phone.** Link cards sync like cards, so the mobile app
  reviews them too. Make sure the mobile review shows them correctly (at least
  front, back and the condition name).

## Rules and constraints

- **Link cards must never contain gap steps.** A link with an empty side
  ("Not in your source") produces no card until the learner fills it.
- **No extra paid calls.** Links come from chain data that already exists.
- **Don't inflate the queue.** Cap how many new link cards enter review per day
  per set (you pick a sensible default) so a big chain doesn't swamp the
  learner.
- **General and other modes are untouched.**
- Accessible and theme-correct at 360px, in the extension and in the mobile app.

## Definition of done

- Link cards are created from chains, reviewed and scheduled like cards, kept in
  step with chain edits, synced, shown on mobile, and highlighted from Needs
  work.
- **Tests cover:**
  - link generation (including skipping gaps),
  - updates on edit,
  - the "substantial change resets scheduling" rule,
  - retirement on delete,
  - the daily cap,
  - sync round trip,
  - mobile mapping.
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

- **Decisions:** how link cards are represented (real cards or derived), the
  card-shape rules, the "substantial change" rule, and the daily cap.
- **Tests:** failing output first, then passing.
- **Anything left rough.**
