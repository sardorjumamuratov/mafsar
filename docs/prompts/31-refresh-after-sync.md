# 31 — Home is empty until you switch tabs

**Depends on:** 20 (sign-in stopped waiting on sync), 21 (per-account storage).
**Branch:** `fix/refresh-after-sync`

You decide the implementation and write your own tests (test first). Follow
`AGENTS.md` in full. Commit only source and test files, with no scratch scripts
and no copies of this prompt. Check `git status` before committing.

## The report

> After signing in, the Home panel is empty. Switch to another tab and come back
> to Home, and the content is there.

## What the code shows (verified by reading, not by reproducing)

Every view paints from **local storage**, never from the network — that's
deliberate, and `tests/ui-static.test.mjs` enforces it ("views paint from local
data before any network call"). The learner's sets arrive later, when the first
sync finishes.

Nothing repaints when that sync lands.

- `finishSignIn` in `src/ui/views/you.js` calls `syncNow().catch(...)` and then
  immediately `renderHome()`. Home reads local storage, which on a fresh sign-in
  is empty, and paints an empty Home. When the sync returns a moment later it
  writes the sets to storage and stops there.
- `init()` in `src/ui/panel.js` does the same on every panel open:
  `renderHome(); syncNow().catch(() => {});`
- Switching tabs calls the renderer again, which re-reads storage — by then the
  sets are in it, so they appear. That's the "fix" the learner found.

This got worse with two recent changes, both correct in themselves: sign-in
stopped waiting on the sync (prompt 20, so a slow sync can't hang the button),
and study data became per-account (prompt 21, so a new account starts empty
locally and *everything* has to come from the first sync).

`goToActiveTab()` in `src/ui/nav.js` already repaints whichever bottom-nav tab is
showing, and `syncNow()` already returns `{ pushed, pulled, serverTime }`.

## What must be true when you're done

1. **A sync that changed anything refreshes what's on screen.** Signing in on a
   device with no local data ends with the learner's sets visible, without
   touching a tab.
2. **A repaint never interrupts the learner.** Not during review, a quiz, teach
   it back or any drill; not while a form or a text area has half-typed input;
   not while a menu or confirm sheet is open. Losing a half-written explanation
   to a background sync is worse than the bug being fixed.
3. **No repaint loop.** A repaint must not trigger a sync that triggers a
   repaint. Say how you prevent it.
4. **Every entry point is covered**, not just sign-in: the panel opening, the
   sync after a review session (`src/ui/flows/review.js`), and the ones in
   `src/ui/views/sets.js` and `src/ui/views/set-detail.js`. One mechanism, used
   everywhere, rather than a call added at each site.
5. **The first moments look deliberate.** On a fresh sign-in there is a window
   where local storage is genuinely empty and a sync is in flight. Show that
   it's loading rather than "you have nothing" — the panel already has skeletons
   for exactly this (see "slots show a skeleton, not a text placeholder" in
   `tests/ui-static.test.mjs`), and they must stay layout-neutral and
   reduced-motion safe.
6. **A failed sync still leaves a usable panel**, with whatever is stored, and
   says what went wrong. Signed in with no network is not an error state.

## Definition of done

- Sign in on a device with no local data: the sets appear on Home by themselves.
- **Tests cover:** a repaint after a sync that pulled rows, no repaint when
  nothing changed, no repaint while a focus view is open, and that the wiring
  goes through one mechanism rather than per-call-site patches.
- Everything in "Verify" passes.

## Verify

```bash
for f in tests/*.test.mjs; do node "$f" > /dev/null || echo "FAIL $f"; done
npm run typecheck
node tools/build.mjs
cd server && npx vitest run && npx tsc --noEmit
```

Then by hand with `dist/chrome` loaded unpacked: sign in on a profile with no
local data and watch Home fill in on its own; start a review, let a background
sync land mid-session, and confirm nothing jumps; go offline and sign in.

## Report

- **The mechanism**, in a few lines, and how it knows a repaint is safe.
- **How you stop a repaint loop.**
- **Files changed,** one line each.
- **Tests:** failing output first, then passing.
- **Which manual checks you ran.**
