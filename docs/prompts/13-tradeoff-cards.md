# 13 — System design: trade-off cards

**Depends on:** 11 (System design mode must exist and be merged). **Branch:** `feat/tradeoff-cards`

You decide the implementation, including how the generator learns about the
set's mode, the prompt wording, and the tests. This file says **what** to
achieve and the rules. Write your own tests, test first.

Read `AGENTS.md` first and follow all of it (one branch, no push or merge,
`setHTML` + `esc()`, no `innerHTML`, append-only migrations). **Commit only
source and test files.** No scratch scripts and no copies of this prompt.
Check `git status` before every commit.

## Why

Card generation is tuned for general knowledge, so a system design chat mostly
becomes definition cards ("What is consistent hashing?"). Design interviews
reward knowing **when and why**: "Consistent hashing vs modulo hashing: when
does it matter?", "Why put a queue between the API and the email sender?". For
System design sets, the generator should favour trade-off and decision cards.

## What should happen

1. **Design sets get design-shaped cards.** When a set is in System design mode,
   generating or regenerating its cards produces mostly:
   - **comparison cards:** "X vs Y: when would you pick each?", answered with the
     deciding factors.
   - **decision cards:** "You need Z under constraint C. What do you choose, and
     what do you give up?"
   - **failure cards:** "What breaks first if … ?"
   - a minority of plain definition cards, only for terms the other cards rely on.
2. **Answers stay reviewable.** Backs stay short enough to check in a few
   seconds: the deciding factors, not an essay. Give the generator the same length
   discipline it already has.
3. **The quiz follows suit.** Quiz questions for design sets test decisions
   ("Which fits a write-heavy, append-only workload?"), not trivia.
4. **Other modes are unchanged.** General and Coding sets generate exactly as
   they do today. Prove this with a test.
5. **Switching mode later.** If a learner switches an existing set to System
   design, the next **Regenerate** uses the design style. Regenerate already
   preserves review schedules for cards whose front survives. Don't break that,
   and tell the learner in the regenerate confirmation that the card style
   changes.

## Rules and constraints

- This is the one design task that changes `/v1/generate`. It's the most
  production-critical route. Keep the change minimal and backward compatible: a
  client that doesn't send a mode (for example the published 0.3.0 extension)
  must get exactly today's behaviour.
- The generation code lives in `server/src/llm.ts` (`generateStudySet`) and the
  route in `server/src/app.ts`. Client-side, generation is triggered from the
  service worker. Find the path and thread the set's mode through it.
- Validate the mode on the server (an unknown value falls back to general).
- Don't raise token budgets or item counts beyond what the provider limits allow
  (see `LLM_MAX_TOKENS` / `LLM_MAX_ITEMS` handling in `llm.ts`).

## Definition of done

- Design-mode generation uses a design-specific instruction set. General and
  coding generation are unchanged.
- **Server tests** with a mocked provider:
  - the design instructions are sent only for design sets,
  - a missing or unknown mode behaves exactly as before,
  - the response shape is unchanged.
- **Client tests:** the set's mode reaches the generate request, including on
  regenerate.
- **A live check:** run the generator once against the real provider with a
  sample system design conversation, and include 5 of the generated cards in your
  report. Pass the key inline in the command, never write it to a file, and don't
  paste it into the report.
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

- **How the mode reaches the generator,** and how old clients stay unaffected.
- **The design instructions** you added, quoted.
- **Five sample generated cards** from the live check.
- **Tests:** failing output first, then passing.
