# 37 — Your stats and feedback

**Depends on:** **35** (it settles the bottom nav, and this page must not add a slot)
**Branch:** `feat/stats-page`
**Touches:** a new `src/ui/views/stats.js`, a new `shared/insights.js`, `src/ui/views/you.js`, `src/ui/views/home.js`, `src/ui/panel.js`, `src/ui/panel.css`

You decide the implementation and write your own tests (test first). Follow
`AGENTS.md` in full. Commit only source and test files, with no scratch scripts
and no copies of this prompt. Check `git status` before committing.

## What the learner wants

A page that shows how they're doing and tells them what to do about it: their
stats, plus plain-language feedback on their studying.

## What already exists

- **You** shows a streak and three numbers (mastered, cards, sets).
- **Home** shows a streak, stats and "insights" (weak cards, `open-weak`).
- Local data has everything needed: every card's FSRS state (`shared/srs.js`),
  the review log with grades and times, daily activity (`shared/streak.js`),
  and exam readiness (`shared/readiness.js`).

## Where it lives

Not a new bottom-nav slot. Prompt 35 fixed the nav at five items. It's a full
page, reached by tapping the stats block on **You** and the stats on **Home**
(with a back button, like set detail). Both blocks show a clear "See all
stats ›" affordance.

## What must be true when you're done

1. **The numbers that matter**, each with a one-line explanation (use a `title`
   or a small info note, as set detail's readiness cells do):
   - Streak, and a **calendar heatmap** of the last ~16 weeks of activity.
   - **Reviews per day** for the last 30 days (a small bar chart; CSS or SVG,
     no library).
   - **Retention**: share of reviews answered correctly, over the last 7 and 30
     days, from the review log.
   - **Mastered over time**: how many cards are mastered now versus 30 days ago.
   - **Coming up**: cards due in each of the next 7 days, from the schedule.
   - **Per set**: mastery %, due now, and exam countdown where one is set. Tap
     to open the set.
2. **Feedback in plain words**: 2 to 4 short, specific, actionable lines worked
   out from the data, for example:
   - "You forget **Renal physiology** cards most. 12 lapses this week. Review
     them first."
   - "Your retention dropped from 88% to 71% this week. Shorter, daily sessions
     help."
   - "You study best in the evening: 84% correct after 6 pm versus 70% in the
     morning."
   - "130 cards are due over the next 3 days. About 45 a day keeps you on
     track for your exam."

   Each line comes from a rule in `shared/insights.js`: pure functions of local
   data, no network, no model call, so they're testable, instant, and work
   offline. Only show a line when there's enough data behind it (pick minimum
   sample sizes and say what they are). Each line links to the action it
   suggests (start review, open the set).
3. **Empty and early states are kind.** With no reviews yet, show what will
   appear and how to get there, not zeros and empty charts.
4. **It paints instantly** from local storage, and refreshes when a sync lands
   through prompt 31's mechanism, without jumping.
5. **Accessible:** every chart has a text alternative (a visually hidden
   summary or table), and colours never carry meaning alone. It works in dark
   mode, at side-panel width and in the tab layout.
6. **No new data flows.** Nothing is sent anywhere, so `privacy.ts` doesn't
   change. Say so in the report.
7. **You and Home get lighter:** they keep a compact summary that links here
   instead of growing more numbers.

Out of scope: the mobile app (though putting the rules in `shared/` means it can
use them later), server-side stats, sending feedback to the developer (a
separate prompt if wanted).

## Definition of done

- With a few weeks of review history, the page shows every section and at least
  two feedback lines that are true of the data.
- A brand-new account sees a friendly empty state, and no false feedback.
- **Tests cover:** each insight rule, including its minimum-data threshold;
  retention and "coming up" maths on a fixed review log; the heatmap buckets;
  the empty state; the entry points from You and Home.
- Everything in "Verify" passes.

## Verify

```bash
for f in tests/*.test.mjs; do node "$f" > /dev/null || echo "FAIL $f"; done
npm run typecheck
node tools/build.mjs
(cd server && npx vitest run && npx tsc --noEmit)
(cd mobile && npm run typecheck && npm test)
```

Then by hand with `dist/chrome` loaded unpacked, on an account with real review
history and on a fresh one.

## Report

- **The insight rules** and their thresholds.
- **Files changed,** one line each.
- **Tests:** failing output first, then passing.
- **Which manual checks you ran.**
