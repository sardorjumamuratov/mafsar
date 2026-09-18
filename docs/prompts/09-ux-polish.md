# 09 — UX polish: delete set, Needs work, updates, delete account

**Depends on:** nothing. **Branch:** `feat/ux-polish`
**Touches:** `src/ui/` (panel.js, core.js, a new confirm.js, set-detail.js, home.js, you.js, delete-account.js, panel.css), `src/storage/readiness.js`, `src/sync/auth.js`, `src/background/service-worker.js`, `server/src/app.ts`, a new `server/src/version.ts`.

Read `AGENTS.md` first and follow it: test first, one branch, don't push or merge,
all HTML through `setHTML` with `esc()` on every interpolated value, and no
`innerHTML`. **Commit only source and test files.** No scratch scripts, no
`fix*.cjs`, no copies of this prompt. Run `git status` before committing and
remove anything you created only for yourself.

There are four independent parts. Do them in order, one commit each.

---

## Part A — Deleting a set looks out of place

### What's wrong now

- **Placement.** The set detail header crams a bare trash icon next to "🔗 Share link" and "↻ Regenerate"
  (`src/ui/views/set-detail.js`, the `.ahd` block of `paintDetail`). It's the
  most destructive action on the screen, and it looks like an afterthought.
- **Native dialog.** Deleting uses the browser's `confirm()`
  (`src/ui/panel.js`, `case "delete-set"`). It is an unstyled OS dialog that
  ignores the panel's theme. In Firefox's sidebar, `window.confirm` is
  unreliable. Check it there: if it returns without showing anything, deleting
  a set is broken in Firefox.
- **Five more native dialogs have the same problem.** Replace all six:

  | File | What it confirms |
  |---|---|
  | `src/ui/panel.js` (`delete-set`) | Delete a set |
  | `src/ui/panel.js` (card delete) | Delete a card |
  | `src/ui/share.js` | Stop sharing a set |
  | `src/ui/views/set-detail.js` (`okToReplace`) | Replace cards on regenerate |
  | `src/ui/views/teams.js` | Leave a team |
  | `src/ui/views/you.js` | Restore a backup |

### Build

1. **`src/ui/confirm.js`** exports
   `confirmSheet({ title, body, confirmLabel, cancelLabel = "Cancel", destructive = false }) → Promise<boolean>`.
   - It's a bottom sheet over the panel, with a dimmed backdrop, built from the
     existing tokens (`--surface`, `--border`, `--r-md`, `.btn`, `.btn-primary`,
     `.btn-danger`). It must look right in light and dark themes and at 360px
     wide.
   - `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` pointing at the
     title.
   - When it opens, focus goes to **Cancel**, not the destructive button. Tab
     cycles inside the sheet. Esc or a click on the backdrop resolves `false`.
     When it closes, focus returns to the element that opened it.
   - A short slide-up. No animation under `prefers-reduced-motion`.
   - When `destructive` is true, the confirm button is `btn btn-primary btn-danger`.
2. **Set detail header:** Back · spacer · 🔗 Share link · **⋯ More**.
   - More is an `.iconbtn` with `aria-haspopup="menu"` and `aria-expanded`. It
     opens a small menu (`role="menu"`, items `role="menuitem"`) holding
     **↻ Regenerate** and, below a divider, **Delete set** in `var(--danger)`.
   - Arrow keys move between items. Esc, or a click outside, closes the menu and
     returns focus to ⋯.
   - Remove the bare trash icon.
3. **Delete set** opens `confirmSheet`:
   - Title: `Delete "<set title>"?` (escaped, truncated to about 60 characters).
   - Body: `This removes the set, its <n> flashcards and its quiz from all your devices. This can't be undone.`
   - Confirm label: `Delete set`, with `destructive: true`.
   - On confirm, run the existing `deleteSession`, show the toast `Set deleted`,
     then call `goToActiveTab()`.
4. **The other five** use `confirmSheet` with their current wording, tidied into
   a title plus a one-sentence body.

### Tests (write first)

In `tests/ui-static.test.mjs`:
- No `confirm(` call remains anywhere in `src/ui/` outside `confirm.js`.
- The set detail header has no `data-action="delete-set"` iconbtn; the menu does.
- `confirm.js` contains `aria-modal="true"` and handles `Escape`.

---

## Part B — "Needs work" shows "0 misses" and can't be tapped

### Root cause

`weakTopics()` (`src/storage/readiness.js`) returns **every card that has ever
been reviewed**, sorted by misses. A miss is a grade below 3, and grades are
Again 0, Hard 3, Good 4, Easy 5. So a card you rated **Hard** has 0 misses, still
fills a slot, and the home screen prints "0 misses". A card rated Easy can
appear too. The existing test `"ranks most-failed concepts first"` in
`tests/client-logic.test.mjs` asserts exactly this: it expects the grade-5 card
`c2` in the result. That expectation is the bug, so change it.

Every flow logs on the same 0–5 scale: review, typed, apply, coding (`correct ? 4 : 1`),
and teach (4, 3, or 1). Keep counting all of them.

### New rules for `weakTopics(reviewLog, cards, now)`

- Look only at each card's **last 5 log rows**, ordered by `reviewedAt` (fall
  back to `at`, which the tests use).
- `misses` = grades below 3. `hards` = grades equal to 3.
- **Include** a card only if `misses > 0 || hards > 0 || forgetRisk`.
- **Exclude recovered cards:** if the last 2 rows are both 4 or higher, drop the
  card, unless `forgetRisk` is true.
- **Sort:** `forgetRisk` first, then `misses` descending, then `hards`
  descending, then average grade ascending.
- **Return** `{ cardId, sessionId, front, misses, hards, avgGrade, forgetRisk }`.
  Cards carry no `sessionId`, so `home.js` must pass cards tagged with their
  set's `sessionId`: `studySets.flatMap(s => (s.flashcards||[]).map(c => ({...c, sessionId: s.sessionId})))`.

### Label (never shows a zero)

| Condition | Tag |
|---|---|
| `forgetRisk` | `Forget soon` (the existing warm dot style) |
| `misses > 0` | `Missed 1×`, `Missed 2×`, … |
| otherwise (`hards > 0`) | `Felt hard` |

### Make rows clickable

- Each row becomes a real `<button type="button" class="insight-row" data-action="open-weak" data-id="<sessionId>" data-card="<cardId>">`
  with a trailing chevron. Style it with full-row hover, `:focus-visible`, and
  pointer cursor, matching the existing list rows. Reset the button's default
  font and alignment.
- `open-weak` opens `renderSetDetail(sessionId, "cards")`. It then scrolls that
  card into view (`block: "center"`) and highlights it briefly with a
  `.flash-highlight` class (about 1.5s tint; no animation under reduced motion).
  First check how `set-detail.js` renders card rows, and add a `data-card-id`
  attribute if there isn't one.
- If the set no longer exists, show the toast `That set was deleted` and stay on
  Home.

### Tests (write first)

In `tests/client-logic.test.mjs`, rewrite the `weakTopics` tests:
- A card rated only Hard is included, with `misses === 0` and `hards === 1`.
- A card rated only Good or Easy is **not** included.
- A card with an early Again followed by two Goods is excluded (recovered).
- Only the last 5 rows count: 6 old Agains followed by 5 Goods means excluded.
- `sessionId` is passed through.
- Log entries for deleted cards are still ignored.

In `tests/ui-static.test.mjs`:
- `home.js` never renders the text `0 miss`.
- Insight rows use `data-action="open-weak"`, and `panel.js` handles it.

---

## Part C — New versions: tell the user, and let the server require one

### How updates work today (put this in your report so the owner knows)

Store installs **do** update automatically. Chrome checks every few hours;
Firefox checks about once a day. But a downloaded update is only *applied* when
the extension is idle or the browser restarts. Someone who keeps the side
panel open can run the old version for days. Unpacked and temporary installs
never update. Nothing in the code handles any of this today.

### Build

1. **Update ready banner.**
   - In `service-worker.js`, listen to `chrome.runtime.onUpdateAvailable`. Store
     `{ updateReady: details.version }` in `chrome.storage.local`.
   - **Don't reload automatically.** That would kill a review in progress.
   - In the `onInstalled` handler, clear `updateReady` when the reason is `update`.
   - Add a message `APPLY_UPDATE` that calls `chrome.runtime.reload()`.
   - On Home and You, when `updateReady` is set, show a slim banner:
     `Mafsar <version> is ready.` with a small **Restart** button that sends
     `APPLY_UPDATE`. The banner is dismissible for the session.
2. **Minimum version, enforced by the server.**
   - Every request from the extension sends `x-mafsar-version: <manifest version>`.
     That covers `authedFetch` and the unauthenticated fetches in
     `src/sync/auth.js`.
   - Add `server/src/version.ts` with `compareVersions(a, b)`: numeric,
     dot-separated, missing parts count as 0.
   - Add middleware on `/v1/*`. Skip `/v1/webhooks/*`. When `MIN_CLIENT_VERSION`
     is set **and** the header is present and lower, return `426` with
     `{ error: "client_outdated", minVersion, message: "This version of Mafsar is out of date. Update it to keep syncing." }`.
   - **A missing header is allowed.** Versions 0.3.0 and older don't send it, and
     they must not be locked out.
   - Check that a CORS preflight from an extension origin still passes with the
     new header.
   - On a `426` in the client: call `chrome.runtime.requestUpdateCheck` where it
     exists (feature-detect it, because Firefox may not have it). Then show a
     persistent banner: `Update required. Restart your browser to finish updating Mafsar.`
     Use the server's `message` when it provides one.

### Tests (write first)

- `server/tests/version.test.ts`: `compareVersions` handles `0.3.0 < 0.4.0`,
  `0.10.0 > 0.9.9`, and `1.0 == 1.0.0`.
- The middleware allows requests with no header, requests at or above the
  minimum, and every request when `MIN_CLIENT_VERSION` is unset. It returns 426
  for a lower version and never blocks webhooks.
- In `ui-static`: the worker handles `APPLY_UPDATE` and listens to
  `onUpdateAvailable`, and `auth.js` sends `x-mafsar-version`.

---

## Part D — The delete account button and page feel off

### What's wrong now

- **The button.** On the You tab, a full-width red `Delete account…` button
  sits directly under Sign out. It's alarming, easy to hit by mistake, and not
  where people expect a destructive setting.
- **The page.** `src/ui/views/delete-account.js` opens with "This can't be
  undone." in bold inside a red box and shouts "Type DELETE". It offers no way
  out except the back arrow, and no chance to keep a copy of your data first.

### Build

1. **You tab.** Remove the red button from the account block, leaving Sign out
   alone there. At the very bottom of the You tab, add a quiet section:
   - A small `t-label` heading, `Account`.
   - One full-width row button, `data-action="delete-account-open"`.
   - Row main text `Delete account` in normal ink (not red), sub-text
     `Permanently delete your account and data` in muted text, and a chevron.
2. **Rewrite the page.** Calm, plain, second person. No red box around the
   whole explanation.
   - Header: back arrow and title `Delete account`.
   - Lead: `Deleting your account permanently removes it and everything in it. This can't be undone.`
   - `t-label` `What gets deleted`, followed by a plain list:
     - `Your study sets, flashcards, quizzes and review history`
     - `Teams you created. Members lose access, and you leave teams you joined.`
     - `Your <Plus|Pro> subscription, cancelled right away with no further charges`.
       Show this item only when `/v1/me` reports a paid plan.
   - A tinted block: `Want a copy first?` with a link button
     `Export your data` (`data-action="export-backup"`, the existing export).
   - `Signed in as <email>`, in muted text.
   - Password field, labelled `Enter your password to continue`. For accounts
     without a password (Google sign-in), hide it and show
     `You signed in with Google, so no password is needed.`
   - Confirmation field, labelled `To confirm, type DELETE`, with no placeholder.
   - Two buttons side by side: **Cancel** (`btn btn-ghost`, `data-action="nav-back"`),
     and **Delete account** (`btn btn-primary btn-danger`, disabled until
     `canConfirmDeletion` passes). While it's working, show `Deleting account…`.
   - Success toast: `Your account has been deleted.`
   - Error messages stay as they are (`deletionErrorMessage`).

### Tests (write first)

In `tests/ui-static.test.mjs`:
- `you.js` no longer contains `btn-danger`.
- `delete-account.js` contains `data-action="nav-back"` on a Cancel button, and
  contains `data-action="export-backup"`.
- Neither file contains the replacement character `�`.

---

## Verify (all must pass)

```bash
cd server && npx vitest run && npx tsc --noEmit
cd ..
for f in tests/*.test.mjs; do node "$f" > /dev/null || echo "FAIL $f"; done
npm run typecheck
node tools/build.mjs
```

Then check by hand: load `dist/chrome` unpacked, and `dist/firefox` as a
temporary add-on.
- The More menu and the confirm sheet work with the mouse and with the keyboard
  only, in light and dark.
- Deleting a set works **in Firefox's sidebar**.
- Tapping a Needs work row lands on the right card, highlighted.
- The You tab and the delete account page look right at 360px wide.

## Report

- **Per part:** what changed, the failing test output, then the passing output.
- **Firefox check:** whether `confirm()` was actually broken in Firefox's sidebar.
- **Owner steps:**
  - Set `MIN_CLIENT_VERSION` in Railway only after a release that sends the
    header is live on both stores.
  - Bump `manifest.json` and publish.
