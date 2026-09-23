# 22 — The panel's top edge looks bolted on

**Depends on:** nothing. **Branch:** `fix/panel-top-seam`
**Small, visual, no new behaviour.**

You decide the implementation and write your own tests (test first). Follow
`AGENTS.md` in full. Commit only source and test files, with no scratch scripts
and no copies of this prompt. Check `git status` before committing.

## The report

> The "Mafsar" text in the top-left corner looks separated from the app. Can we
> blend it into the page? Same for the X button in the top-right.

## Read this before you plan anything

**That bar is the browser's, not ours.** Firefox draws the sidebar header from
`sidebar_action.default_title` and its own close button; Chrome draws the side
panel header from the extension name and its own close button. Neither can be
hidden, restyled or coloured by an extension, and both follow the *browser*
theme, not the page. Do not try to remove it, do not fake a close button, and do
not add a permission chasing it.

So the goal is not to merge the bar into the page. It's that the panel below it
should stop looking like a **different** surface that happens to start there:
one continuous thing, where the bar reads as the window frame.

What's making it worse today:
- our dark background is a teal-tinted near-black (`--bg: #0c1312`), while both
  browsers' default dark chrome is a neutral grey; two different darks meeting
  at a hard line is what reads as "separated";
- some views open with a bare small-caps label sitting directly under the bar
  (the account screens, for example), so the content starts in mid-air, while
  others open with a proper `.ahd` header. The panel has no consistent top.

## What must be true when you're done

1. **No hard colour band** at the top of the panel in either browser's default
   light and dark themes. The page's top surface should sit close enough to the
   browser's chrome that the join reads as a frame, not a seam.
2. **Every view has a deliberate top.** Nothing starts flush against the browser
   bar with a floating label. Find the views that skip `.ahd` and give them a
   consistent top; the focus modes (review, drills, teach) keep their own
   `rev-top` row, which should follow the same rule.
3. **The theme still works.** Light, dark, and the explicit
   `body[data-theme="dark"]` path all stay correct; the existing guard test
   "native widgets follow the panel theme" must keep passing.
4. **Nothing else moves.** No new markup sinks (`setHTML`/`esc` only), no layout
   regressions at the panel's minimum width (300px), and the bottom nav is
   untouched.
5. If you change palette tokens, change them in one place (`:root` and the two
   dark blocks in `src/ui/panel.css`) and keep every existing
   `--token` defined — `tests/ui-static.test.mjs` checks that.

## Definition of done

- The panel reads as one surface from the browser bar down, in Chrome's side
  panel and Firefox's sidebar, light and dark.
- **Tests cover:** whatever rule you introduce (for example, that every view
  renderer opens with the shared top element), plus the existing static guards
  still passing.
- Everything in "Verify" passes.

## Verify

```bash
for f in tests/*.test.mjs; do node "$f" > /dev/null || echo "FAIL $f"; done
npm run typecheck
node tools/build.mjs
```

Then by hand: load `dist/chrome` unpacked in Chrome and `dist/firefox` in
Firefox, and look at Home, Sets, a set's detail, You, and one focus mode, in
both light and dark. Screenshots or a plain description of each are fine. Say
which browsers you actually opened.

## Report

- **What you changed and why it reduces the seam** — remembering you can't touch
  the bar itself.
- **Before and after** for the top of the panel, in both themes.
- **Files changed,** one line each.
- **Tests:** failing output first, then passing.
- **What you couldn't check** (a browser you don't have, a theme you can't set).
