# 33 — Capture buttons live above the bottom nav

**Depends on:** —
**Branch:** `feat/capture-dock`
**Touches:** `src/ui/views/sets.js`, `src/ui/views/import.js`, `src/ui/panel.html`, `src/ui/panel.css`, `src/ui/panel.js`, `src/ui/tab-watch.js`

You decide the implementation and write your own tests (test first). Follow
`AGENTS.md` in full. Commit only source and test files, with no scratch scripts
and no copies of this prompt. Check `git status` before committing.

## The report

> The Capture this page and Capture last answer buttons are hard to find. They
> sit at the bottom of the Sets list, under a share-code form. The Sets tab
> should show only sets. Make the capture buttons sticky, just above the bottom
> nav.

## What the code does now

`renderSets()` in `src/ui/views/sets.js` renders, in order: the header (with
Import), the list of sets, an **"Add a shared set"** form (code input and Look
up button), then `#captureAnswerBtn` and `#captureCurrentBtn`. Capturing is the
main way sets get made, and it is the last thing on the page and only on one
tab.

Two things about those buttons must survive the move:

- **Permission requests happen inside the click.** `refreshCaptureCurrentButton()`
  and `refreshCaptureAnswerButton()` keep `data-kind` / `data-origin` on the
  buttons up to date with the active tab, so the click handler can call
  `chrome.permissions.request` before any `await`. The browser ignores the
  request otherwise. `tests/ui-static.test.mjs` checks this.
- **"Capture last answer" appears only on an AI chat tab** (`isAIChatTab`), and
  it starts hidden so the list never waits on a slow content script.

`src/ui/tab-watch.js` already knows when the active tab changes.

## What must be true when you're done

1. **A capture dock sits directly above the bottom nav** on every bottom-nav
   tab. It lives in the panel shell (`panel.html`), not inside a view, so it
   doesn't flash when switching tabs. It is hidden wherever the bottom nav is
   hidden (focus views: `showChrome(false)`), and on screens with their own
   bottom action bar (set detail's `.footer-cta`), so two bars never stack.
2. **It shows the right action for the tab the learner is on:**
   - On an AI chat, **Capture answer** is the main button and **Capture page**
     is secondary.
   - Elsewhere there is one button, labelled by the source `classifyUrl` finds:
     *Capture page*, *Capture video* (YouTube) or *Capture PDF*.
   - On a page nothing can be captured from (`chrome://`, the store, Mafsar's
     own page), the button is disabled with a short reason, not missing, so the
     dock doesn't jump.
   - It updates when the active tab changes, through `tab-watch.js`.
3. **Nothing about capturing breaks.** Same messages, the same `tabId`
   targeting (prompt 23's open-in-tab fix), and the same permission request
   before any `await`. The "Capturing…" state and errors show on the dock
   button. Existing tests that pin this move with the buttons: update what they
   point at, never weaken what they assert.
4. **The Sets tab shows only sets:** header (title plus Import) and the list.
   The **"Add a shared set"** form moves to the Import view, as a third way in
   next to Quizlet and Anki, with the same behaviour and the same duplicate
   check (`s.shareCode === code`). The empty state stops mentioning buttons that
   aren't there.
5. **The dock never covers content.** Views get enough bottom space that the
   last row can be scrolled clear of the dock. It respects
   `env(safe-area-inset-bottom)` and works at the narrow side-panel width and in
   the wide tab layout.
6. **It feels light:** one compact row, 44 px touch targets, visually tied to
   the nav (same surface, no double border), dark mode, and
   `prefers-reduced-motion` respected for any show/hide transition.

## Definition of done

- On a ChatGPT tab, the dock shows *Capture answer* on Home, Sets and You, and
  it works. On a YouTube tab it shows *Capture video*. Set detail and a review
  show no dock.
- **Tests cover:** the dock is in the shell and not in `sets.js`; the Sets view
  has no capture buttons or share form; the share form is in the Import view
  with the duplicate check; the permission request still comes before any
  `await`; the dock is hidden when `showChrome(false)`; the label follows the
  source kind.
- Everything in "Verify" passes.

## Verify

```bash
for f in tests/*.test.mjs; do node "$f" > /dev/null || echo "FAIL $f"; done
npm run typecheck
node tools/build.mjs
cd server && npx vitest run && npx tsc --noEmit
```

Then by hand with `dist/chrome` loaded unpacked: capture an answer on an AI chat,
a normal page, a YouTube video and a PDF from the dock, in the side panel and
in a tab (prompt 23). Switch tabs and watch the label follow.

## Report

- **Where the dock lives** and how it decides what to show.
- **Files changed,** one line each.
- **Tests:** failing output first, then passing.
- **Which manual checks you ran.**
