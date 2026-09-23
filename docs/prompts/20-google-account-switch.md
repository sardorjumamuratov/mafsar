# 20 — Google sign-in hangs when switching accounts

**Depends on:** nothing. **Branch:** `feat/account-switch`
**Priority:** this one is a live bug, and part of it moves one account's data into another.

You decide the implementation and write your own tests (test first). This file
describes the bug, what I already ruled in and out, and what must be true when
you're done. Follow `AGENTS.md` in full. Commit only source and test files, with
no scratch scripts and no copies of this prompt. Check `git status` before
committing.

## The report

> Sign in with Google, sign out, then sign in again with a **different** Google
> account. It just hangs there.

The button keeps saying "Waiting for Google…" and never returns.

## What the code shows (verified by reading, not by reproducing)

1. **The panel waits on a sync before it finishes signing in.**
   `authGoogle` in `src/ui/views/you.js` awaits `googleSignIn(...)`, then
   `afterSignIn(...)`, which awaits `syncNow()`. The button is only restored in
   the `catch`. `authedFetch` (`src/sync/auth.js`) sets **no timeout**, so a sync
   that stalls leaves the button on "Waiting for Google…" forever, even though
   the tokens are already stored and sign-in actually worked.
2. **Switching accounts uploads the previous account's library.** Signing out
   deliberately keeps local sets ("Your sets stay on this device"), and
   `logout()` clears the whole `auth` record, including `lastSync`. So the first
   sync as account B pushes **everything belonging to account A** into B, and
   pulls B's rows into the same local store. That is a data-separation bug on its
   own, and it makes that first sync slow, which is probably what you're seeing
   hang. The mobile app already handles this: `saveSession` in
   `mobile/src/auth/index.ts` notices a different user id and the caller clears
   local data.
3. **A stale attempt swallows the next click.** `authGoogle` starts with: if
   `googleAbortController` is set, abort it, `renderHome()` and return. If an
   earlier attempt is still polling (the learner closed the Google tab instead of
   cancelling, and the loop keeps going for its full 10 minutes), the next click
   silently cancels and navigates Home instead of starting a sign-in.
4. **Polling is expensive and has no backoff.** `googleSignIn` polls every 1.5s
   for up to 10 minutes: 400 requests per attempt, against a 500/hour per-IP
   limit (`googlePollPerIp` in `server/src/ratelimit.ts`). Two attempts in an
   hour can exhaust it, and the second attempt then fails on a limit rather than
   on anything the learner did.
5. **The poll route reads every pending login row** (`SELECT * FROM
   pending_logins`, then compares hashes in JS) on every poll.

Assume nothing here is the whole story: **reproduce it first** and say in your
report what actually happened, including which of the above you confirmed or
ruled out.

## What must be true when you're done

1. **No dead end.** Whatever fails, the panel never sits on "Waiting for
   Google…". Sign-in shows either the signed-in state or a message saying what
   went wrong, with the button usable again. Network calls that can block the UI
   need a timeout.
2. **Signing in finishes before syncing.** The learner is signed in as soon as
   the tokens arrive. A slow or failing first sync shows as a sync problem
   ("Couldn't sync yet"), not as a sign-in that never ends, and it must be
   retryable.
3. **One account's data never lands in another.** When the account that signs in
   differs from the one whose data is on this device, the local library must not
   be pushed to the new account. Decide what to do with that data and say why:
   clearing it, keeping it per-account, or asking. Whatever you choose, the
   learner must not silently lose sets they still want, and must not silently
   upload them either. Signing back in to the **same** account keeps working
   exactly as it does today, including unsynced reviews.
4. **Clicking the sign-in button always tries to sign in.** A stale attempt is
   ended and a new one started, never a silent trip to Home.
5. **Polling costs less:** back off as it goes, give up in a way the learner can
   see, and stop when the sign-in tab is closed. Staying inside the per-IP budget
   for two consecutive attempts in the same hour is the target.
6. **The poll route looks up its row directly** instead of scanning the table.
   Keep the constant-time comparison of the token hash.
7. `/v1/auth/google/start` sends the version header like every other request
   (`versionHeader()` in `src/sync/auth.js`).

## Definition of done

- The reported sequence works: sign in with Google, sign out, sign in with a
  different Google account, and land signed in as the second account with the
  panel in a sane state.
- **Tests cover:** the account-switch rule (data of A is not pushed as B),
  sign-in completing independently of sync, a stalled or failing sync surfacing
  as an error rather than a hang, a stale attempt not eating the next click, the
  poll backoff, and the poll route's lookup.
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

Then by hand, with the built extension (`dist/chrome` loaded unpacked), using
**two real Google accounts**:
- sign in with account A, sign out, sign in with account B;
- sign in with A, sign out, sign back in with A (unsynced reviews survive);
- start a sign-in and close the Google tab without finishing, then sign in again;
- start a sign-in and press Cancel.

Say plainly which of these you ran and which you couldn't.

## Report

- **What the bug actually was,** and which of the five suspects above were
  involved.
- **The account-switch decision** and why.
- **Files changed,** with one line each.
- **Tests:** failing output first, then passing.
- **Which manual checks you ran,** and with how many accounts.
