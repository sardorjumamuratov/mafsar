# 10 — Teach it back: show who you're teaching

**Depends on:** 08 (merged). **Branch:** `feat/teach-persona-indicator`
**Touches:** `src/storage/teach.js`, `src/ui/flows/teach.js`, `src/ui/panel.css`, `tests/teach.test.mjs`, `tests/ui-static.test.mjs`.

Read `AGENTS.md` first and follow it: test first, one branch, don't push or merge,
all HTML through `setHTML` with `esc()` on every interpolated value, and no
`innerHTML`. **Commit only source and test files.** No scratch scripts, no
`fix*.cjs`, no copies of this prompt. Run `git status` before committing.

## The problem

On the intro screen the learner picks who they're teaching: "A curious
12-year-old" or "A complete beginner" (`paintTeachIntro` in
`src/ui/flows/teach.js`). Once the chat starts, `paintTeachChat` shows only
`Teaching <topic>`, and nothing on screen says who the audience is. That choice
is what makes the exercise work: you explain differently to a child. So the
learner should always be able to glance and see it.

The persona can't change mid-session (`setTeachPersona` returns early once
there are messages), so this is a reminder, not a control.

## Design: quiet, always there, never in the way

The reminder should read like a label on the page, not a notification. No
banner, no colour block, no animation, no extra row of height.

1. **A persona chip on the header line** of the chat screen.
   - The existing `Teaching <topic>` label stays on the left. The chip sits on
     the same line, at the right: `🧒 12-year-old` or `🙋 Beginner`.
   - Use the existing muted `.tag` look (`--surface-2` background, `--muted`
     text, 11px). **Not** primary or warm colours: it must not compete with the
     conversation.
   - It's not a button: no hover, no pointer cursor, not focusable.
   - `aria-label="You're teaching a curious 12-year-old"` (or "a complete
     beginner"), and a `title` tooltip: `Chosen at the start. To teach someone
     else, finish and start again.`
   - When the topic is long, the topic truncates with an ellipsis. The chip
     never wraps or shrinks (`flex-shrink: 0`). Check this at 360px wide.
2. **Reinforce it in words, without adding UI.**
   - Textarea placeholder: `Answer the 12-year-old, or keep explaining…` /
     `Answer the beginner, or keep explaining…`.
   - Typing indicator `aria-label`: `The 12-year-old is thinking` /
     `The beginner is thinking`.
3. **Carry it through to the end.**
   - The "Looking at how you taught…" loading line becomes
     `Looking at how you taught <topic> to a 12-year-old…`.
   - On the results screen, add a muted sub-line under the `How you taught`
     title: `<topic> · to a curious 12-year-old`.
4. **Intro screen:** the persona buttons show the same emoji as the chip
   (`🧒 A curious 12-year-old`, `🙋 A complete beginner`), so the chip is
   recognisably the choice made there.

## One source of truth

Add to `src/storage/teach.js` (pure, no DOM) and use it everywhere instead of
repeating strings:

```js
export const PERSONAS = {
  child:    { emoji: "🧒", short: "12-year-old", long: "a curious 12-year-old", option: "A curious 12-year-old" },
  beginner: { emoji: "🙋", short: "beginner",    long: "a complete beginner",   option: "A complete beginner" },
};
/** Unknown values fall back to child, matching setTeachPersona. */
export function personaInfo(id) { … }
```

The chip reads `${emoji} ${short}`, but capitalise it for the chip only
(`12-year-old`, `Beginner`). Build the placeholder and aria text from `short`,
and the sub-lines from `long`.

## Tests (write first)

`tests/teach.test.mjs`:
- `personaInfo("child")` and `personaInfo("beginner")` return the right
  entries. Unknown or empty values fall back to child.
- Every persona has `emoji`, `short`, `long` and `option`.

`tests/ui-static.test.mjs`, in the "Teach it back" section:
- `paintTeachChat` renders a persona chip (a `teach-persona-chip` class) with
  an `aria-label`, and builds it from `personaInfo`.
- The chip is not a `<button>` and carries no `data-action`.
- The textarea placeholder and the typing indicator's `aria-label` use the
  persona.
- `teach.js` contains no hard-coded `"A curious 12-year-old"` string outside
  `src/storage/teach.js`: the labels come from `PERSONAS`.

## Verify (all must pass)

```bash
for f in tests/*.test.mjs; do node "$f" > /dev/null || echo "FAIL $f"; done
npm run typecheck
node tools/build.mjs
```

Then by hand, with the panel harness (`tests/harness/panel-harness.html?signedIn`)
or the built extension:
- Start Teach it back with each persona. The chip shows the right one, on the
  header line, in light and dark.
- At 360px wide with a long set title, the title truncates and the chip stays
  whole on the same line.
- A screen reader announces the chip's label, and the chip can't be tabbed to.

## Report

What changed, the failing then passing test output, and a screenshot of the
chat header in light and dark.
