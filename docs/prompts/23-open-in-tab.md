# 23 — Run Mafsar in a tab, with no browser header above it

**Depends on:** 21 (it adds a row to the You tab, which 21 also edits).
**Branch:** `feat/open-in-tab`

You decide the implementation and write your own tests (test first). Follow
`AGENTS.md` in full. Commit only source and test files, with no scratch scripts
and no copies of this prompt. Check `git status` before committing.

## The report

> Why are there two panels? Can't the bottom one lengthen and the top one
> disappear? It's like this in Firefox.

The learner means the bar above our page: **"Mafsar"** on the left and an **X**
on the right, in a slightly different dark from the panel below it.

## What can't be done, so don't try

That bar is **the browser's**, not ours. Firefox draws the sidebar header from
`sidebar_action.default_title`; Chrome draws the side panel header from the
extension name. Neither can be hidden, resized, recoloured or replaced by an
extension, and both follow the browser theme rather than the page. There is no
manifest key and no API for it. Do not fake a close button, do not add a
permission chasing it, and do not set the body background to `transparent` —
that shows the browser's default page canvas (white in light mode, where our
cards are also white), not its chrome.

A popup window (`chrome.windows.create({ type: "popup" })`) is not the answer
either: it trades the sidebar header for an OS title bar.

## What we can do

**The same panel page, opened as an ordinary tab, has no header at all** — just
our own UI, full height. So: keep the sidebar as the default, and let the
learner choose to run Mafsar in a tab instead.

## What must be true when you're done

1. **A way in.** The learner can open Mafsar in a tab — a row on the You tab is
   the obvious place. If you also make it the toolbar icon's behaviour, that
   choice has to persist, and on Chrome you must turn off
   `setPanelBehavior({ openPanelOnActionClick: true })` in `service-worker.js`
   while it's on, or the click keeps opening the side panel.
2. **One Mafsar tab, not five.** Opening it again focuses the existing tab.
3. **Capture still works — this is the hard part.** `queryActiveTab` in
   `src/ui/core.js` asks for `{ active: true, currentWindow: true }`. In a tab,
   that *is* Mafsar, so "Capture this page" and "Capture last answer" would
   read the panel itself. Decide how to fix it — remembering the last real
   content tab (`src/ui/tab-watch.js` already watches tab changes) is one way,
   refusing with an honest message is another — but **Mafsar must never capture
   its own page**, in either mode.
4. **It must look right wide.** `panel.css` is built for a 300–400px column. In
   a maximised tab it must stay a readable centred column rather than stretching
   a 1900px-wide row of cards, and the bottom nav has to stay usable.
5. **Both browsers.** Chrome (side panel) and Firefox (sidebar) both get it; the
   toolbar-click handler in `service-worker.js` already branches on
   `chrome.sidebarAction`.
6. **No manifest permission changes.** `tabs` is already granted.
7. Sidebar mode keeps working exactly as it does today, and everything that
   assumes the panel is beside the page keeps working there.

## Definition of done

- Opening Mafsar in a tab gives the full app with no header above it, laid out
  as a column, and capture still targets the page the learner was looking at.
- **Tests cover:** the active-tab rule (Mafsar never captures itself), the
  single-tab rule, the persisted preference and the Chrome panel-behaviour flip,
  and the wiring.
- Everything in "Verify" passes.

## Verify

```bash
for f in tests/*.test.mjs; do node "$f" > /dev/null || echo "FAIL $f"; done
npm run typecheck
node tools/build.mjs
```

Then by hand, in both browsers: open in a tab, capture a page from it, capture
the last answer from an AI chat, maximise the window and look at the layout, and
check the sidebar still behaves as before. Say which browsers you actually
opened.

## Report

- **How capture finds the right tab,** and what happens when there isn't one.
- **Files changed,** one line each.
- **Tests:** failing output first, then passing.
- **What you couldn't check.**
