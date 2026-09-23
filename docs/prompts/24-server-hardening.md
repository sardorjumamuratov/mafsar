# 24 — Request limits, IP trust, and the signing secret

**Depends on:** nothing. **Branch:** `feat/server-hardening`
**Everything here is server-side. It is the highest-priority work in the queue.**

You decide the implementation and write your own tests (test first). Follow
`AGENTS.md` in full. Commit only source and test files, with no scratch scripts
and no copies of this prompt. Check `git status` before committing.

## Three holes, found by reading the code

### A. Two routes accept an unlimited request body

`bodyLimit` appears exactly once, on `/v1/extract/pdf` (`server/src/app.ts`).
`/v1/sync` and `/v1/generate` have none, and `syncSchema` (`server/src/schema.ts`)
caps none of its arrays: `sets`, `cards`, `quiz`, `activity`, `reviews`,
`chains`, `chainSteps` are all unbounded, and `generateSchema.messages` has a
`min(1)` with no `max` and no length limit on `text`.

So one signed-in account can post a body of any size: parsed into memory, then
written to Turso, or forwarded to the model. The extension truncates captures to
24 000 characters (`MAX_CAPTURE_CHARS` in `src/storage/sources.js`) but the
server never checks, so one quota unit can buy an arbitrarily large model call.

### B. The rate limiter keys on a header the caller controls

`ipSource()` in `server/src/app.ts` defaults to `"xff-first"`, i.e. the **first**
entry of `X-Forwarded-For`. Behind one proxy that entry is whatever the client
sent; the trustworthy one is the last, appended by the edge. Every per-IP limit
— login, registration, signup-per-day, Google polling — is bypassable by sending
a forged header.

### C. The fallback signing secret is public

`secretKey()` in `server/src/auth.ts` throws on a missing `JWT_SECRET` only when
`NODE_ENV === "production"`. Otherwise it signs with the literal string
`mafsar-dev-secret`, which is in this public repo. A deployment where `NODE_ENV`
was never set signs real tokens with a value anyone can read, so anyone can mint
a token for any account.

## What must be true when you're done

1. **No route can be sent an unbounded body.** Pick limits per route rather than
   one global number: a sync payload is legitimately much larger than a grade
   request. Over the limit is a clear 413, not a crash.
2. **Every array and string in `syncSchema` and `generateSchema` has a cap**, and
   the caps are stated where a reader will find them.
3. **A large library still syncs.** This is the constraint that makes A
   interesting: after prompt 21's migration, a learner's *first* sync pushes
   everything they own. If your cap can reject that, the client has to send it in
   batches — decide, implement whichever you choose end to end, and prove a big
   library round-trips. A learner must never reach a state where their data
   cannot sync at all.
4. **The safe IP source is the default in code**, not something an env var has to
   remember. A forged `X-Forwarded-For` must not move a request into a fresh
   rate-limit bucket. Keep `CLIENT_IP_SOURCE` as an override for deployments
   with a different proxy depth, and say in a comment what each value means.
5. **The server refuses to sign with a public secret.** Missing or default
   `JWT_SECRET` should fail loudly everywhere except where a dev or test run
   explicitly opts in. The existing suite must keep working without anyone
   setting a secret by hand.
6. **Nothing in the 34 existing server test files is weakened** to make this
   pass. If one of them depended on a hole, say so in your report.

## Definition of done

- **Tests cover:** an over-limit body on each capped route, a payload with too
  many rows, an over-long generate message, a forged `X-Forwarded-For` not
  earning a fresh bucket, the boot-time refusal of a missing/default secret, and
  a large-but-legitimate library syncing successfully.
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

- **The limits you chose and why**, in a short table.
- **What happens to a library too big for one sync**, and how you proved it works.
- **Files changed,** one line each.
- **Tests:** failing output first, then passing.
- **Anything a deployment must now set** that it didn't before — say it plainly,
  because this can take production down if it's missed.
