# 26 — Local data: the review log, the storage budget, and a stale API key

**Depends on:** 21 (partitions), and run it after 25 (both edit `store.js`).
**Branch:** `fix/local-data-hygiene`

Three small, unrelated problems in one branch because they live in the same
file. You decide the implementation and write your own tests (test first).
Follow `AGENTS.md` in full. Commit only source and test files, with no scratch
scripts and no copies of this prompt. Check `git status` before committing.

## A. The review log drops rows that were never synced

`appendReviewLog` (`src/storage/store.js`) trims to the newest `REVIEW_LOG_CAP`
(2000) with no regard for what has reached the server:

```js
if (log.length > REVIEW_LOG_CAP) log.splice(0, log.length - REVIEW_LOG_CAP);
```

A long offline stretch — a commute, a flight, a week with no signal — silently
loses the oldest reviews before they can be pushed. Card schedules survive (FSRS
state lives on the card), so this isn't catastrophic, but streaks, stats and the
practice evidence other devices would have seen are gone for good.

**Required:** a row that hasn't synced is not dropped just because it is old.
The cap exists to stop unbounded growth, so keep a bound — but bound something
that can't cost the learner data, and say what happens if someone somehow
accumulates a huge number of unsynced rows.

## B. Nothing limits how much space the partitions take

Prompt 21 gives each account its own copy of `sessions`, `studySets`, `activity`
and `reviewLog`. Nothing ever removes one. `chrome.storage.local` is capped
(the manifest does **not** request `unlimitedStorage`, and **you must not add
it** — it changes the install prompt and triggers store re-review).

**Required:** the device can't quietly fill up. `chrome.storage.local.getBytesInUse`
tells you where you stand. Decide the policy and defend it in your report:
evicting an account whose `lastSync` proves the server already has everything is
the safe kind of eviction; deleting anything unsynced is not. Whatever happens,
the learner must be able to find out that it happened — a silent deletion of
someone's sets is the one outcome that is not acceptable.

## C. A stale personal API key is still sitting in local storage

`DEFAULT_SETTINGS = { provider: "gemini", apiKey: "", model: "" }`
(`src/storage/store.js`) is left over from when the extension called the model
directly. The server has held the key since the backend landed, and nothing in
`src/` reads these fields any more — but anyone who used an early build still
has **their own API key** stored on disk, unused and unreachable.

**Required:** drop the dead fields, and clear any stored value on upgrade so the
old key doesn't linger. Check first that nothing still reads them (search, don't
assume) and say what you found.

## Definition of done

- **Tests cover:** an unsynced row surviving the cap, a synced row being trimmed,
  the eviction policy (including that it refuses to evict unsynced data), and the
  settings cleanup.
- Everything in "Verify" passes.

## Verify

```bash
for f in tests/*.test.mjs; do node "$f" > /dev/null || echo "FAIL $f"; done
npm run typecheck
node tools/build.mjs
cd server && npx vitest run && npx tsc --noEmit
```

## Report

- **The new cap rule**, in one sentence.
- **The eviction policy**, and why it can't lose data.
- **What still read the old settings fields**, if anything.
- **Files changed,** one line each.
- **Tests:** failing output first, then passing.
