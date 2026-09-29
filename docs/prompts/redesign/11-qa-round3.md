# Redesign 11: QA pass for round 3

**Depends on:** 05–10
**Branch:** `redesign/11-qa-round3`
**Reference:** all files in `docs/design/reference/`
**Read first:** `docs/prompts/redesign/README.md` and `AGENTS.md`.

Audit round 3 against the spec, and fix every difference. Write a test for each
item that can be tested statically. Report each item as ✅ or fixed, with how
you checked it.

## From the design document
- The nav is exactly Home, Sets, Discover, Stats, You. Teams is reachable from
  You. There's no raised play button.
- There are no capture or import buttons on the Sets screen. The capture dock
  shows on every tab except during a session and in card edit mode. (The
  "keyboard open" condition doesn't apply on desktop.)
- Edit turns the card into fields in place, with no route change or modal. Done
  is disabled when a field is empty. Esc cancels and ⌘/Ctrl+Enter saves. Other
  rows dim to 40%.
- A rating changed on Set detail shows at once in the Sets row, Home's Continue
  and Discover (the same root id), and survives closing and reopening the panel.
- Search the whole client (`src/`, `shared/`) and every API response for
  "category". It must not appear in UI text or DTOs. **The single allowed
  exception** is the billing quota error's `category` bucket (`set` / `coding`
  / `practice`), handled in `src/sync/api.js`. See 08.
- Discover never lists the learner's own sets. The "Added" state persists.
- Top rated respects the 3-rating minimum. A set with a single 5★ rating never
  outranks one with 500 ratings averaging 4.8.
- Make private removes the set from Discover within 1 minute (the catalogue
  version invalidates the cache), and existing copies keep working.
- Star buttons have a 34×34 tap target and radiogroup semantics. The star colour
  is #f0c75e, never the due amber.
- Stats chart bars have aria-labels. The empty state shows with fewer than 10
  reviews.

## Added
- **Offline:** Discover shows its cached list and the offline line; ratings
  given offline appear at once and reach the server on the next sync; Stats
  works fully.
- **Signed out:** Discover shows its sign-in state; "Make it global" explains
  that sharing needs an account; feedback sends with the IP limit.
- **Owner edits reach copies:** edit a card as the owner, sync, and the copy
  updates. Edit the copy's card, and the next owner edit leaves it alone.
- **Sources that can't be published** (Quizlet, imports, shared, copies) are
  refused by the UI and by the API.
- **Reports:** three accounts reporting hide a set; the admin restores it.
- **Privacy text** (`server/src/privacy.ts`) covers categories and interests,
  publishing and the display name, reports, and feedback with screenshots.
- **Mobile:** `cd mobile && npm run typecheck && npm test` passes, and a
  mobile sync round-trip keeps `description`, `renamed`, `originSetId`,
  `originCardId`, `detached` and `durationMs`.
- **Everything in 04's "Added" list,** re-checked for the new screens: the light
  theme, the widths from 320 to 480, tab mode, the Firefox sidebar, keyboard
  only, reduced motion.

## Report
A table of item | result | how checked, then README rule 12.
