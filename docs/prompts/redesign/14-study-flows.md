# Redesign 14: Study Flows

**Depends on:** 13
**Branch:** `redesign/14-study-flows`
**Reference:** `docs/design/06-study.html`
**Read first:** `docs/prompts/redesign/README.md` and `AGENTS.md`.

We are updating the UI of the core study flows to match the new design system.
This includes:
- Flashcards (`src/ui/flows/review.js`)
- Type the Answer (`src/ui/flows/typed.js`)
- Teach it Back (`src/ui/flows/teach.js`)
- Multiple Choice / Quiz (`src/ui/flows/quiz.js`)

## 1. Shared Layout and Header

All study views live inside a focused, dark container.
Read `docs/design/06-study.html` for the exact markup.

- Every flow has a header with:
  - A close button (IconButton style) with an SVG `x`.
  - A progress bar (background `#27322f`, filled part `#34bcad`).
  - Text indicating progress, e.g. `0 / 6`.

## 2. Teach It Back (`src/ui/flows/teach.js`)

Match the TEACH IT BACK screen exactly.
- "TEACH IT BACK" is the upper case label at the top.
- The prompt includes the phrase and instructions (bold "Just 78").
- The "IDEAS TO GET ACROSS" is a list.
- "WHO ARE YOU TEACHING?" segmented control allows picking an audience. Active uses `rgba(52, 188, 173, 0.1)` and teal border. Inactive uses `border: 1px solid #27322f`.
- The textarea and "Start teaching" button match the layout exactly.

## 3. Flashcards (`src/ui/flows/review.js`)

Match the FLASHCARDS screen exactly.
- The card container uses `background: #141d1b` and `border: 1px solid #27322f`.
- The "QUESTION" label is inside the card container.
- Divider line is `height: 1px; background: #27322f;`.
- The grade buttons (Again, Hard, Good, Easy) use a transparent background with `border: 1px solid #27322f` and specific colors for the text:
  - Again: `#f08a7a` (matches `--danger-text` in dark mode)
  - Hard: `#fca048`
  - Good: `#34bcad`
  - Easy: `#58d8db`
- "Apply it — fresh scenario" action is below the grades.

## 4. Type the Answer (`src/ui/flows/typed.js`)

Match the TYPE THE ANSWER screen exactly.
- The prompt is large bold text.
- Textarea for typing the answer has `background: #141d1b`.
- The "Check answer" button is a primary teal button.
- Secondary "AI-graded" hint/button is `background: #1c2826`.

## 5. Multiple Choice (`src/ui/flows/quiz.js`)

Match the MULTIPLE CHOICE screen exactly.
- The options are boxed buttons.
- The letter indicators (A, B, C, D) are in smaller boxes.
- Selected / Correct state uses a teal border and teal filled letter box.
- Incorrect state uses a red border (`#f08a7a`) but the letter box stays dark.
- The feedback note has `background: #1c2826` and "Not quite." highlighted in red.
- "Next question" is a primary teal button.

**IMPORTANT:** Implement these changes strictly by updating the `render` functions in the respective JS files. Extract any reusable CSS into `src/ui/panel.css` if necessary, ensuring no old legacy CSS classes break the design.

**Report:** Follow the standard report rules. List any missing functionality or tests you had to update.
