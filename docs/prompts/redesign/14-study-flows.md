# Redesign 14: Study Flows

**Depends on:** 13
**Branch:** `redesign/14-study-flows`
**Reference:** `docs/design/06-study.html`
**Read first:** `docs/prompts/redesign/README.md` and `AGENTS.md`.

We are updating the UI of the core study flows to a strict, restrained design system.
This includes:
- Flashcards (`src/ui/flows/review.js`)
- Type the Answer (`src/ui/flows/typed.js`)
- Teach it Back (`src/ui/flows/teach.js`)
- Multiple Choice / Quiz (`src/ui/flows/quiz.js`)

## WHAT'S WRONG
1. **Misaligned flow layout:** Missing consistent top header with close button across all 4 flows.
2. **Inconsistent UI elements:** Grade buttons in flashcards use generic `.btn-ghost` without specific color coding for Again/Hard/Good/Easy.
3. **Missing state indications:** Multiple choice options lack the A/B/C/D letter boxes and distinct borders for correct/incorrect states.
4. **Incorrect surfaces:** Textareas in Type the Answer lack the `#141d1b` surface background.
5. **Layout shifting:** Teach It Back missing the segmented persona selection control.

## REMOVE
- Emojis from buttons and labels.
- The `.flashcard` card boundary around the flashcard (it should just be text directly on the screen background).
- `.btn-ghost` usages in `review.js` grades.
- Old progress bar markup in all flow headers.
- Old `.btn-primary` actions that do not span full width with border-radius 8.

## LAYOUT
- Top-level container: `display: flex; flex-direction: column; background: #0e1513`.
- Header: `display: flex; align-items: center; justify-content: space-between; padding: 16px; border-bottom: 1px solid #27322f`.
- Content sections: `padding: 24px 16px; display: flex; flex-direction: column; gap: 24px`.

## COMPONENTS
- **StudyHeader**: 
  - Close button: `width: 32px; height: 32px; border-radius: 6px; background: transparent; color: #9aa9a4`.
  - Progress text: `font-size: 13px; font-weight: 500; color: #9aa9a4; font-variant-numeric: tabular-nums`.
- **Flashcard Content**:
  - `h1` large left-aligned text for the question.
  - 1px divider `#27322f`.
- **GradeRow**:
  - `display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px`.
  - Buttons: `border-radius: 8px; border: 1px solid #27322f; padding: 12px 0`.
  - Colors: Again (`#f08a7a`), Hard (`#fca048`), Good (`#34bcad`), Easy (`#58d8db`).
- **QuizOption**:
  - `padding: 16px; border-radius: 8px; border: 1px solid #27322f; background: #0e1513`.
  - LetterBox: `width: 20px; height: 20px; border-radius: 4px; background: #141d1b`.
  - Correct state: border `#34bcad`, LetterBox bg `#34bcad` color `#04211d`.
  - Incorrect state: border `#f08a7a`, LetterBox bg `#27322f`.

## STATES
- `review.js`: Pre-flip (hides grades), post-flip (shows grades).
- `quiz.js`: Unselected (default border), Correct selected (accent border), Incorrect selected (danger border).
- `teach.js`: Persona selected (`#141d1b` bg, `#e7eeec` text), unselected (transparent).

## ACCEPTANCE
1. All four study flows render the exact new header with progress text and without the old green progress bar fill.
2. The flashcard has no card background, it just sits on the main background `#0e1513` and is left-aligned.
3. The quiz options render A/B/C/D letter boxes.
4. Emojis are completely removed from the UI.
5. The persona selector in Teach It Back visually highlights the active choice with a `#141d1b` background.
