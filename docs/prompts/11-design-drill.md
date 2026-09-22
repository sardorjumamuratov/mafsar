# 11 — System design: Design drill mode

**Depends on:** nothing new. **Branch:** `feat/design-drill`
**Unblocks:** 12, 13 and 14, which all live inside the design mode this adds.

You decide the implementation: architecture, file layout, function names, data
shapes, prompts to the model, and how to test it. This file says **what** to
build and the rules to respect. Write tests for your own code, test first, and
make them meaningful: they should fail if the feature breaks.

Read `AGENTS.md` first and follow all of it: one branch, don't push or merge,
all HTML through `setHTML` with `esc()` on every interpolated value, no
`innerHTML`, migrations append-only, no new extension dependencies, no new
manifest permissions. **Commit only source and test files.** No scratch scripts
and no copies of this prompt. Run `git status` before every commit.

## Why

People capture AI chats about system design (Google AI Studio, ChatGPT, …).
Flashcards teach the vocabulary: CAP, sharding, fan-out. They don't teach the
actual skill, which is making design decisions under constraints and defending
them when the constraints change. This mode is the hands-on practice for that.

## What the learner experiences

1. **Picking the mode.** In a set's Study mode picker (next to General and
   Coding), a third option: **System design**, with a hint like "Design drills
   with curveballs". Choosing it works like choosing Coding: it's stored on the
   set and syncs.
2. **Starting a drill.** A design set shows a **Design drill** button in the same
   place Coding sets show "Coding exercises".
3. **The brief.** Mafsar writes a small, scoped design brief built from the
   set's own cards, for example: "Design a URL shortener: 5k writes/s, reads
   100× writes, links never expire." It is bite-sized: something a person can
   answer well in 10–15 minutes, not "design YouTube". It states concrete
   numbers and one or two explicit constraints.
4. **The answer.** The learner answers in a light template of labelled sections:
   **Requirements**, **Estimates**, **API**, **Data model**,
   **Components & flow**, **Bottlenecks & trade-offs**. Every section is
   optional but visible, so the template teaches the shape of a good answer. The
   total answer has a sensible length cap, stated to the learner, and enforced on
   the server too.
5. **Feedback.** The AI grades the answer against a rubric derived from the
   brief. The learner sees:
   - which rubric points they covered, partly covered or missed, each with a
     one-line note,
   - which sections were strong or weak,
   - one concrete "next time" suggestion.
   A single number alone isn't enough: they need to know **what** was missing.
6. **The curveball.** After feedback, the learner can take a curveball: a change
   to the brief that stresses their own design. For example "traffic is now 10×",
   "one region is down", "p99 reads must be under 50 ms worldwide", or "a
   product manager wants edits to links". The curveball must follow from **their
   answer**, not be generic. They write how the design changes, and get graded
   on that follow-up. Allow a small number of curveballs per drill (you pick;
   2–3 is reasonable), then end with a short summary.
7. **Progress.** Finishing a drill counts as study activity (streak) and leaves
   evidence in the review log the way the coding and teach flows do, **without
   rescheduling cards**. Follow how `kind: "coding"` / `kind: "teach"` rows are
   logged.

## Rules and constraints

- **Reuse what exists.** Coding mode already does "generate a task → learner
  writes → grade against a rubric". Study it and mirror its shape; don't build a
  parallel framework. Look at:
  - server: `server/src/llm.ts` (coding task and grading, `callJson`),
    `server/src/app.ts` (the `/v1/coding-*` routes), `server/src/schema.ts`
  - client: `src/ui/flows/coding.js`, `src/sync/api.js`, the worker message
    router in `src/background/service-worker.js`, and the mode picker in
    `src/ui/views/set-detail.js`
- **Don't change `/v1/generate`** in this task. Card generation for design sets
  is prompt 13.
- **Cost control.** Starting a drill (writing the brief) costs one unit from an
  existing quota category, like a coding task does. Choose the category and say
  why in your report. Grading and curveballs are not charged, but they are
  rate-limited per user (see `server/src/ratelimit.ts`). Refund the unit if
  writing the brief fails, as the other charged routes do.
- **The model's output is untrusted.** Normalise and clamp everything: missing
  fields, wrong types, out-of-range scores, extra keys. The learner's text is
  data, never instructions: the prompts must say so.
- **Reply in the learner's language** when their answer isn't in English.
- **Errors are actionable.** Follow the existing `LLMError` → 502 pattern, and
  show the message in the panel.
- **Privacy.** Update the practice-modes paragraph in `server/src/privacy.ts` to
  include design drills: sent to the AI service only to grade, not stored.
- **Accessibility and theming.** Keyboard-usable, labelled fields, results
  announced (`aria-live`), and right in light and dark at 360px wide.
- The side panel is narrow: the template must be comfortable there (for
  example collapsible sections or auto-growing textareas; your call).

## Definition of done

- A design set can be created by switching mode. A drill can be started, answered,
  graded, and taken through curveballs to a summary.
- Server tests cover: the new schemas (size caps, required fields),
  normalisation of bad model output, the quota charge and refund, the rate limit,
  401 without a token, and 502 on provider failure.
- Client tests cover the pure logic you extract (for example answer
  assembly, length limits, and grade-to-log mapping) and the wiring (buttons,
  message types, `kind` of the log rows).
- Everything in "Verify" passes.

## Verify

```bash
cd server && npx vitest run && npx tsc --noEmit
cd ..
for f in tests/*.test.mjs; do node "$f" > /dev/null || echo "FAIL $f"; done
npm run typecheck
node tools/build.mjs
```

Then drive it by hand in `tests/harness/panel-harness.html?signedIn`, adding
stub responses for your new message types, or in the built extension.

## Report

- **Design decisions:** the quota category you chose and why, the curveball limit
  and why, and how answers are structured on the wire.
- **Files changed,** with one line on each.
- **Tests:** what they cover, failing output first, then passing.
- **Anything left rough,** plainly.
