# 30 — Know which features are actually used

**Depends on:** nothing (it edits `app.ts`, so don't run it beside 24 or 29).
**Branch:** `feat/usage-counts`

You decide the implementation and write your own tests (test first). Follow
`AGENTS.md` in full. Commit only source and test files, with no scratch scripts
and no copies of this prompt. Check `git status` before committing.

## Why

Mafsar has nine practice modes — review, quiz, typed, coding, teach it back,
design, estimation, bottleneck, chain drills, clinical cases, compare — and no
way to tell whether anyone uses any of them. `server/src/app.ts` has carried a
`// --- Phase 3: analytics — TODO ---` marker since the backend was built. Every
decision about what to build next is currently a guess.

## The constraint that shapes this

`server/src/privacy.ts` says, in the policy users are shown:

> We don't run analytics or tracking scripts in the extension.

**That promise stays true.** Nothing is added to the extension: no events, no
identifiers, no third-party script, no new network call. The server already sees
every request; this task is only about *counting what it already handles*.

## What must be true when you're done

1. **Aggregate counts, nothing per-person.** How many times a route was called
   in a period. No user ids, no IPs, no row that can be traced to one learner,
   nothing about what they studied. If a design decision would let someone
   reconstruct one person's activity, it's the wrong design.
2. **Practice routes are distinguishable.** "How many clinical cases were started
   last week" has to be answerable, or this buys nothing. Route paths already
   separate them.
3. **Cheap.** Counting must not add a round trip to a request. In-memory counters
   flushed periodically are fine; a write per request to Turso is not.
4. **Readable by you, not by the world.** Admin-only, through the existing
   `ADMIN_EMAILS` mechanism (`server/src/billing/core.ts`). A stranger hitting
   the endpoint gets a 404 or a 403, never data.
5. **It survives a restart** well enough to be useful — Railway restarts the
   process on every deploy, and losing a week of counts to a deploy makes the
   numbers worthless.
6. **The privacy policy is updated in the same change** if what you add is
   visible to users in any way. If it genuinely isn't — aggregate server-side
   request counts, nothing user-linked — say so in your report and explain why
   the existing wording still holds. `privacy.ts` is the policy; it must never
   describe something the code doesn't do, or omit something it does.

## Definition of done

- A week of use produces a table that answers: which modes were used, how often,
  and how that changed.
- **Tests cover:** counting, the aggregation, admin-only access, and that no
  identifier is stored.
- Everything in "Verify" passes.

## Verify

```bash
cd server && npx vitest run && npx tsc --noEmit
cd ..
for f in tests/*.test.mjs; do node "$f" > /dev/null || echo "FAIL $f"; done
npm run typecheck
```

## Report

- **What is stored, exactly** — the shape of one row.
- **Why it can't identify anyone.**
- **Whether the privacy policy needed a change**, and your reasoning either way.
- **Files changed,** one line each.
- **Tests:** failing output first, then passing.
