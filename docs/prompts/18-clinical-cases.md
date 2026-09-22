# 18 — Medicine: clinical cases

**Depends on:** 15, and 11 (reuse the Design drill's brief → answer → rubric
engine). **Branch:** `feat/clinical-cases`

You decide the implementation and write your own tests (test first). This file
says **what** to build and the rules. Follow `AGENTS.md` in full. Commit only
source and test files, with no scratch scripts and no copies of this prompt.
Check `git status` before committing.

## Why

Clinicians reason from a patient back to a cause, then forward to treatment.
Cases give medical learners that hands-on reasoning practice, and the feedback is
mapped onto the chains they're learning.

## What the learner experiences

1. **Starting.** A **Clinical case** button on Medicine sets. The case is built
   from one of the set's chains (or occasionally two similar ones, to force a
   choice between them).
2. **The presentation.** A short vignette: age, presenting complaint, relevant
   history, examination findings. It reads like a real case, not a quiz
   question.
3. **Staged reasoning.** The case unfolds in steps, and the learner answers each:
   - leading diagnosis and why (reasoning back along the chain),
   - **Request test:** pick from a short list of plausible investigations.
     Results appear only for requested tests, and requesting irrelevant tests is
     noted gently in feedback,
   - final diagnosis and first-line management.
4. **Feedback mapped to the chain.** For each link, show whether the learner used
   it, skipped it or got it wrong ("✓ trigger → inflammation", "✗ didn't mention
   reversibility, the key finding"). Then one concrete thing to do next time,
   and the full chain.
5. **Progress.** Counts toward the streak, logs evidence with its own `kind`, and
   doesn't reschedule cards directly. You may nudge link cards (prompt 16) the
   learner clearly got wrong. Decide and justify.

## Rules and constraints

- **Reuse the Design drill engine** (prompt 11): its routes, schemas, grading
  and flow patterns. Extend it; don't fork it.
- **Grounded in the learner's material.** The case and the reference reasoning
  come from the set's chains. The model may write a realistic presentation
  around them but must not introduce findings, tests or treatments that
  contradict the source, and no doses unless the source gives them.
- **Hide the answer.** The reference diagnosis and reasoning must not be visible
  to the client before the learner commits each stage. Choose how, and keep it
  tamper-tolerant: editing the payload only lets a learner cheat themselves.
- **Framing.** "Practice case built from your notes. Not medical advice." Quiet
  and permanent, no modal. Never use real patient data.
- **Cost.** Generating a case costs one unit from an existing quota category (say
  which). Stage grading is rate-limited per user.
- Reply in the learner's language. The learner's text is data. Normalise the
  model's output.
- Privacy: extend the practice-modes paragraph in `server/src/privacy.ts`.
- Accessible and theme-correct at 360px wide.

## Definition of done

- A case can be generated, worked through in stages with test requests, and
  graded with chain-mapped feedback.
- **Tests cover:**
  - schemas and caps,
  - normalisation,
  - hidden reference data,
  - quota charge and refund, the rate limit, 401 and 502,
  - the client-side pure logic and wiring.
- A live check with the real provider on a sample chain. Include the generated
  vignette in your report. Pass the key inline and never save it.
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

- **Decisions:** how the Design drill engine was extended, how the answer is
  hidden, the quota category, and any link-card nudging.
- **The live-check vignette.**
- **Tests:** failing output first, then passing.
- **Anything left rough.**
