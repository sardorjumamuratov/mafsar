# 17 — Medicine: chain drills (rebuild, fill the gap, backwards)

**Depends on:** 15. **Branch:** `feat/chain-drills`

You decide the implementation and write your own tests (test first). This file
says **what** to build and the rules. Follow `AGENTS.md` in full. Commit only
source and test files, with no scratch scripts and no copies of this prompt.
Check `git status` before committing.

## Why

Short, tactile exercises that make the learner **produce** the chain rather than
recognise it. Two minutes a day, and fun enough to do voluntarily.

## What the learner experiences

1. **Starting.** A **Chain drill** button on Medicine sets (next to Review). A
   round picks one of the set's chains (favour weaker or less-drilled ones) and
   one exercise.
2. **Rebuild.** The chain's filled steps appear shuffled. The learner puts them
   in order by tapping them one after another into slots (no fiddly
   drag-and-drop required, though you may add it). A wrong placement gets
   gentle feedback: brief highlight, the correct neighbour revealed, no harsh
   error styling. Must be fully usable by keyboard.
3. **Fill the gap.** The chain is shown with one step blanked. The learner types
   it. Grading must accept correct answers in different words, so use the existing
   written-answer grading path (`/v1/grade`) or an equivalent. Show the reference
   statement and its why afterwards.
4. **Backwards.** Start from a later step ("A patient wheezes when breathing
   out") and ask the learner to reconstruct the steps upstream toward the cause.
   Grade each reconstructed step and show the full chain at the end.
5. **End of round.** The full chain with the learner's mistakes highlighted, a
   one-line takeaway, and **Another round** / **Done**.
6. **Progress.** Counts toward the streak and logs review-log evidence with its
   own `kind`. Drills are practice, so they don't reschedule cards directly.
   Decide whether a clearly failed link should nudge its link card (prompt 16) to
   come up sooner, and justify the decision.

## Rules and constraints

- **Grade Rebuild locally.** It needs no AI call and no cost.
- **Only filled steps are drilled.** Gap steps are skipped, and a chain with too
  few filled steps to drill says so and suggests filling it in.
- **Cost.** Any AI-graded exercise (fill the gap, backwards) is charged or
  rate-limited consistently with the existing practice flows. Say which in your
  report.
- **The learner's text is data, never instructions.** Normalise the model's
  output.
- Accessible (announce correctness via `aria-live`, keyboard order) and
  theme-correct at 360px wide. Respect `prefers-reduced-motion` for any
  highlight or shake.

## Definition of done

- All three exercises work end to end, with the round picker, summary and
  logging.
- **Tests cover:**
  - shuffle and order checking,
  - weak-chain selection,
  - skipping gaps,
  - grading mapping for typed answers,
  - logging `kind`,
  - keyboard wiring.
- Everything in "Verify" passes.

## Verify

```bash
cd server && npx vitest run && npx tsc --noEmit
cd ..
for f in tests/*.test.mjs; do node "$f" > /dev/null || echo "FAIL $f"; done
npm run typecheck
node tools/build.mjs
```

## Report

- **Decisions:** chain selection, grading approach per exercise, the cost model,
  and whether failures nudge link cards.
- **Tests:** failing output first, then passing.
- **Anything left rough.**
