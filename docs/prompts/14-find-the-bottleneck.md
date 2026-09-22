# 14 — System design: "Find the bottleneck"

**Depends on:** 11 (System design mode must exist and be merged). **Branch:** `feat/find-the-bottleneck`

You decide the implementation: architecture, names, data shapes, model prompts,
and tests. This file says **what** to build and the rules. Write your own tests,
test first.

Read `AGENTS.md` first and follow all of it (one branch, no push or merge,
`setHTML` + `esc()`, no `innerHTML`, append-only migrations, no new extension
dependencies or permissions). **Commit only source and test files.** No
scratch scripts and no copies of this prompt. Check `git status` before every
commit.

## Why

The Design drill (prompt 11) trains building a design. This trains the reverse:
reading someone else's design and spotting what fails under load or failure.
That's how you get depth, and interviewers probe it directly.

## What the learner experiences

1. **Starting.** In a System design set, a **Find the bottleneck** button,
   alongside Design drill and Estimation drill.
2. **The scenario.** Mafsar describes a small, realistic architecture as a short
   narrative plus a component list, with traffic numbers. It has **one planted
   flaw** (occasionally two, and then it says so). The flaw is drawn from the
   set's topics. Examples:
   - a single write primary behind a global read-heavy API,
   - retries without idempotency keys on a payment call,
   - a hot partition key (a celebrity user ID),
   - a synchronous call chain where one slow dependency stalls everything,
   - a cache with no TTL and no invalidation path.
3. **Show it visually, in text.** Render the components and connections so the
   design is easy to scan in a narrow panel, for example an indented flow
   (`Client → CDN → API (3×) → Postgres primary`). No diagram library and no
   canvas. Keep it plain, readable and theme-correct.
4. **The answer.** The learner writes: **what breaks**, **why** (under what load
   or failure), and **how to fix it**. They can ask for **one hint**, which
   narrows where to look without naming the flaw, at a cost to the score shown.
5. **Feedback.** Graded on three separate parts: did they find the planted flaw,
   is the explanation of why it fails right, and does the fix actually work
   (with its own trade-off named). Then the reveal: the planted flaw, a model
   explanation, and a good fix. If they found a **different, genuine** problem,
   credit it and say so. Don't mark real insight wrong just because it wasn't the
   planted flaw.
6. **Progress.** Counts toward the streak and leaves review-log evidence with
   its own `kind`, without rescheduling cards (follow the coding and teach
   flows).

## Rules and constraints

- **Reuse** the shape of the Design drill (prompt 11) and coding mode: routes,
  schemas, worker messages, UI patterns. Don't add a new framework.
- **The scenario must hide the answer.** The planted flaw and model solution come
  back from the server, but the client must not show them before the learner
  submits. The grading call must receive the planted flaw so grading is
  consistent. Choose how to carry it (for example returned opaquely and sent
  back, or re-derived) and justify your choice in the report. Keep it
  tamper-tolerant: a learner editing the payload should only be able to cheat
  themselves.
- **Cost:** generating a scenario costs one unit from an existing quota category
  (say which). Hints and grading are rate-limited per user and not charged.
- The model's output is untrusted: normalise it. The learner's text is data,
  never instructions.
- Reply in the learner's language.
- Privacy: extend the practice-modes paragraph in `server/src/privacy.ts`.
- Accessible (the flow rendering must make sense to a screen reader) and
  theme-correct at 360px wide.

## Definition of done

- A scenario can be generated, rendered, answered (with an optional hint),
  graded on the three parts, and revealed.
- **Server tests:**
  - schemas and caps,
  - normalisation,
  - the planted flaw isn't exposed in whatever the client renders before
    submitting,
  - quota charge and refund, the rate limit, 401 and 502.
- **Client tests** for the pure logic you extract, and for the wiring.
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

- **Decisions:** how the planted flaw is carried, the hint penalty, and the quota
  category.
- **Files changed.**
- **Tests:** failing output first, then passing.
- **Anything left rough.**
