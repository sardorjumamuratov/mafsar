# 21 — One device, several accounts: each sees only its own sets

**Depends on:** 20 (it replaces most of what 20 added). **Branch:** `feat/per-account-data`

You decide the implementation and write your own tests (test first). This file
says what must be true, not how. Follow `AGENTS.md` in full. Commit only source
and test files, with no scratch scripts and no copies of this prompt. Check
`git status` before committing.

## The problem

Local study data lives in four flat `chrome.storage.local` keys — `sessions`,
`studySets`, `activity`, `reviewLog` — shared by whoever happens to be signed
in. Signing out keeps them ("Your sets stay on this device"), so signing in with
a second Google account finds the first account's library sitting there.

Prompt 20 patched over this by asking the learner what to do ("Move them to this
account" / "Remove them from this device") and blocking sync until they
answered. That question shouldn't exist. **An account should simply see its own
sets, and nothing else.**

## What must be true when you're done

1. **No question is ever asked.** Signing in lands the learner in their own
   library. Delete the switch screen, its two actions, the pending-switch flag,
   the boot check and the sync guard that 20 added
   (`paintAccountSwitch`, `showAccountSwitchIfPending`, `keepLocalDataAndFinalize`,
   `clearLocalDataAndFinalize`, `accountSwitchPending`, `noteSignedInUser`, the
   `auth-keep-data` / `auth-clear-data` actions, and the static guard test that
   enforces them). Keep everything else 20 added: the request timeouts, the
   poll backoff and its `pollId` lookup, and sign-in not waiting on a sync.
2. **Data belongs to an account, not to the device.** Everything a learner
   captures, reviews and schedules is stored under the account that made it:
   sets, sessions, cards, quiz, chains, review log, activity and streak.
3. **Signing back in to the same account finds everything**, including work done
   offline that never reached the server. A sign-out followed by a sign-in must
   not cost a single review.
4. **No account ever sees or uploads another's rows.** With A's library on the
   device, signing in as B shows B's library only, and the first sync as B
   pushes nothing of A's. This is the bug that made 20 necessary; it must now be
   impossible by construction rather than by a warning screen.
5. **Unsynced work is never destroyed silently.** If you drop another account's
   local copy to save space, drop it only when the server already has it. Say in
   your report what you chose and why.
6. **`lastSync` is per account.** Today it lives inside the `auth` record, which
   `logout()` deletes, so every sign-in re-pushes the whole library. An account's
   sync cursor should survive a sign-out.
7. **Existing installs lose nothing.** A learner updating to this build keeps
   the library already on their device, under the account they are signed in as
   (or last signed in as). Migrate once; don't leave data stranded under the old
   keys.
8. **One accessor.** After this change, nothing outside the storage layer reads
   or writes those four keys directly — not the panel, not the service worker,
   not backup, not delete-account. Add a test that fails if a new direct read
   appears; the worker writing a captured set to the wrong place would be
   invisible otherwise.
9. **Backups carry study data, not credentials.** `exportAll` currently dumps
   *every* `chrome.storage.local` key into the downloaded file, which includes
   the `auth` record with the access and refresh tokens. A backup must contain
   the signed-in account's study data and no tokens, and importing one must load
   into the signed-in account. Old backup files must still import.
10. **Delete account** removes that account's data and signs out, and must not
    take another account's unsynced library with it.

## Decisions you have to make and state

- **How the partition is keyed.** The server user id is the obvious key; say
  what happens before the first sign-in, and to anything captured while signed
  out (the panel gates on an account at boot, but the context menu and the
  worker can still write — check).
- **How much is kept.** `chrome.storage.local` is capped (the manifest does not
  request `unlimitedStorage`, and **you must not add it** — it changes the
  install prompt and triggers store re-review). Say what stops two or three
  accounts' libraries from filling the quota.

## Definition of done

- Sign in as A, capture a set, sign out, sign in as B: B sees an empty library,
  and nothing of A's reaches B's account. Sign out, sign back in as A:
  everything is there, schedules included.
- **Tests cover:** the partition (A's rows are invisible and unsyncable as B),
  the same-account round trip including unsynced changes, the one-time migration
  of an existing device, `lastSync` surviving a sign-out, backup without tokens,
  delete-account, and the no-direct-access guard.
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

Then by hand with the built extension (`dist/chrome` loaded unpacked), using two
accounts: the A → B → A sequence above, a capture made while signed out, an
export and re-import, and an upgrade over an existing profile (load the old
build, make a set, then load this one and check it's still there). Say plainly
which of these you ran and which you couldn't.

## Report

- **The storage model** you chose, in a few lines.
- **What happens to another account's data**, and why that's safe.
- **Files changed,** one line each.
- **Tests:** failing output first, then passing.
- **Which manual checks you ran,** and with how many accounts.
