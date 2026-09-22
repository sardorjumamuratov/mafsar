# 12 — System design: estimation drills

**Depends on:** 11 (System design mode must exist and be merged). **Branch:** `feat/estimation-drills`

You decide the implementation: architecture, names, data shapes, model prompts,
and tests. This file says **what** to build and the rules. Write your own tests,
test first, and make them catch real breakage.

Read `AGENTS.md` first and follow all of it (one branch, no push or merge,
`setHTML` + `esc()`, no `innerHTML`, append-only migrations, no new extension
dependencies or permissions). **Commit only source and test files.** No
scratch scripts and no copies of this prompt. Check `git status` before every
commit.

## Why

Back-of-the-envelope estimation is part of every system design interview and
most people are weak at it. It's also quick, numeric and repeatable: a perfect
fit for short daily drills.

## What the learner experiences

1. **Starting.** In a System design set, next to **Design drill**, an
   **Estimation drill** button.
2. **A short round.** A few questions (you pick the count; about 5 is right)
   grounded in the set's topic. For example: "How much storage do 5 years of
   tweets need?", "QPS for 50M daily active users at 20 requests each?", "How
   many cache servers for 200 GB of hot data at 64 GB each?". Each question
   states its assumptions, or asks the learner to state theirs.
3. **Answering.** A number plus a unit (for example `300 TB`, `12k QPS`,
   `2.5 GB/s`) and an optional line of working. Accept common human input:
   `12k`, `1.2e4`, `12,000`, `1.5 million`, and unit prefixes `K M G T P` for
   bytes and for rates. Tell the learner clearly when an input can't be parsed,
   instead of silently grading it wrong.
4. **Grading.** Estimation is judged by **order of magnitude**, not exact
   match. Define tolerance bands, for example within 2× = spot on, within 10× =
   right ballpark, otherwise off. Show the model's worked solution step by step,
   so the learner sees where their reasoning diverged.
5. **End of round.** A summary: how many were spot on / ballpark / off, and the
   single most useful habit to fix (for example "you forgot replication factor").
6. **Progress.** Counts toward the streak. Leaves review-log evidence with its
   own `kind`, without rescheduling cards, following how the coding and teach
   flows log.

## Rules and constraints

- **Grading the number is deterministic code, not the model.** The model writes
  the questions, the reference answers (value + unit) and the worked solutions.
  Your code parses the learner's number and unit, converts both sides to a common
  base, and computes the band. This is the core of the feature: test it
  thoroughly, including unit mismatches (bytes vs bits, per second vs per day),
  zero, negatives and garbage.
- The model's output is untrusted: validate and normalise reference answers, and
  drop or regenerate questions without a usable numeric answer.
- **Cost:** generating a round costs one unit from an existing quota category
  (say which and why). Grading happens locally, so it costs no LLM call.
- **Reuse** the patterns of the Design drill (prompt 11) and coding mode for
  routes, schemas, worker messages and UI. Don't build a new framework.
- Privacy: extend the practice-modes paragraph in `server/src/privacy.ts` if
  anything new is sent to the AI service.
- Accessible and theme-correct at 360px wide. Numeric inputs get a sensible
  `inputmode`.

## Definition of done

- A round can be generated, answered, graded with bands, and summarised.
- Unit tests prove the parser and band logic across the formats listed above.
- Server tests cover the new route: schema, normalisation, quota charge and
  refund, 401, and 502.
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

- **Decisions:** the round size, tolerance bands, supported units, and quota
  category.
- **Files changed.**
- **Tests:** failing output first, then passing.
- **Anything left rough.**
