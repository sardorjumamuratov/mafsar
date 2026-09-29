# Redesign 10: Stats and feedback tab (mock 3d)

**Depends on:** 00 (the nav slot), 01 (daily goal), 03 (the segmented bar)
**Branch:** `redesign/10-stats`
**Reference:** `docs/design/reference/05-stats.html`, `logic.js`
**Read first:** `docs/prompts/redesign/README.md` and `AGENTS.md`.
**Touches:** a new `src/ui/views/stats.js`, a new `shared/insights.js`, `src/ui/flows/review.js` (review duration), `server/src/db.ts` (migrations), `server/src/sync.ts`, `server/src/schema.ts`, `shared/sync-map.js`, `server/src/app.ts` (feedback), `server/src/privacy.ts`

Add a Stats tab (nav slot 4) with the learner's stats and actionable feedback.
This replaces prompt 37; don't run 37.

## Where the numbers are computed (changed from the design, on purpose)
The design says insights are computed on the server nightly. In Mafsar they're
computed **on the device, when the tab renders,** from local data, by pure
functions in `shared/insights.js`. Three reasons:
- "Mornings", "after 6 pm" and "today" need the learner's **local clock and
  time zone,** which the server doesn't know.
- It works offline, like every other view.
- It sends nothing new anywhere.

The output is the same as the design's; only where it runs changes. Say so in
the report.

## Added: review duration
"Studied" needs session time, and the review log has only timestamps. Record
**`durationMs`** on each new review-log entry: the time from the card being
shown to it being graded, capped at 120,000. It's synced (README rule 8: a
`review_log.duration_ms` migration, the schema, `sync.ts`, `sync-map.js`) and
null for old entries. Reviews without it count as **22 seconds** each (the same
figure as the daily goal in 01).

## Layout
Scroll container: padding 18px 16px 24px (plus clearance for the docked bars),
column, gap 16. The capture dock and nav sit at the bottom, with Stats active.

1. **Header** (padding 0 4px, gap 2): "Stats" at 24px / 650 / −0.02em (the
   `<h1>`), and the range label at 13px / text.muted: "Last 7 days" | "Last 30
   days" | "Since {Mon D of the first review}" (with the year when it isn't the
   current year).
2. **Segmented control:** "Week" | "Month" | "All time" (the same component as
   Set detail's tabs). Changing it updates blocks 3–4. Block 5 always covers all
   cards. The choice is remembered for the session.
3. **Figures card:** radius 16, bg.surface, 1px border.card, a grid of 3 equal
   columns. Each cell has padding 14 and gap 2, and cells 2–3 have a 1px left
   border border.card.
   - Value at 22px / 700 / −0.02em. Label at 13px / text.muted.
   - **Reviews** = the count of review events in the range. **Retention** = the
     percentage of reviews graded Good or Easy (Mafsar grades 4 and 5; Again is
     0 and Hard is 3), rounded, or "—" with no reviews. **Studied** = total
     review time, formatted "2h 40m" (minutes only under an hour, "0m" for
     none).
4. **Chart card:** padding 16, radius 16, bg.surface, 1px border.card, gap 14.
   - SectionLabel: "Reviews per day" (Week: 7 bars ending today), "Reviews per
     week" (Month: the calendar weeks, Monday to Sunday, that overlap the last
     30 days, 4–5 bars) or "Reviews per month" (All time: one bar per month since
     the first review, *added:* at most the last 12).
   - **Plot area:** height 128, flex, align-items flex-end, gap 8. Each bar
     column (flex 1, gap 6, bottom aligned) holds, from top to bottom:
     - A value label at 11px / 600. The current period uses accent.text; others
       use text.muted. Hide the label when the value is 0.
     - The bar: full column width, radius 6, height = `max(4, value / max × 84)`
       px. The current period is accent (#34bcad), other periods chart.bar
       (#2c4a46), and zero values chart.zero (#1e2826).
     - An axis label at 11px. The current period is accent.text / 700 ("Today",
       "This wk" or, *added,* "This mo"). Others are text.faint / 500 (the
       weekday letter, the week's start as "Sep 8", or the month as "Sep").
   - **Accessible:** each bar has `aria-label="{label}: {value} reviews"`, and
     the plot has `role="img"` with a one-line summary ("Busiest: Tuesday, 42
     reviews").
5. **"All cards" card** (padding 16, radius 16, bg.surface, 1px border.card, gap
   10): SectionLabel "All cards", then the same segmented bar and legend as Set
   detail (03 §3, without "How it works"), summed across all sets.
6. **"FEEDBACK"** SectionLabel, then up to 3 insight cards. A card: padding 16,
   radius 16, bg.surface, 1px border.card. A row (gap 10): an 8px dot (amber
   for a problem, status.mastered green for a positive), then a column (gap 4)
   with the title at 15px / 600 and the body at 14px / line-height 1.45 /
   text.body2.
   - An optional action: an OutlineButton, height 36, margin-left 18,
     accent.text.
   - **Insight rules** (each type at most once; show the top 3 by priority).
     *Added: the design didn't set a priority order,* so it's c, a, d, b.
     - **a. Slipping set:** a set with at least 20 reviews in the range and
       retention at least 10 points below the learner's average. Title "{Set}
       is slipping"; body "Retention {x}%, the lowest of your sets. {mode tip}";
       action "Review with {mode}", which starts that set in that mode. Use Type
       answers when more than 40% of the cards contain code or symbols (a
       tested heuristic: code fences, backticks, or a high density of `{}();=<>`
       or maths symbols), otherwise Flashcards.
       - *Added, the mode tips:* Type answers → "Typing answers makes you
         recall, not just recognise." Flashcards → "A short review today brings
         it back."
       - With several slipping sets, name the lowest.
     - **b. Best time:** one time bucket beats the others by at least 8 points.
       Buckets are morning (05:00–11:59), afternoon (12:00–17:59) and evening
       (18:00–04:59), local time, each needing at least 30 reviews in the range.
       Title "{Mornings | Afternoons | Evenings} work for you"; body "You recall
       {n}% more in sessions {before noon | in the afternoon | after 6 pm}." `n`
       = the winner's retention minus the average of the other qualifying
       buckets, rounded. No action. Green dot.
     - **c. Backlog:** due > 3 × the daily goal (01's goal logic). Title "Your
       backlog is growing"; body "{n} cards are overdue. A 15-minute session
       today clears {k}."; action "Start 15 min". `k = min(n, floor(15 × 60 /
       22))` = up to 40, and the action starts a session with the k most
       overdue cards.
     - **d. Streak risk:** the streak is at least 3 days, nothing has been
       studied today, and it's 18:00 local time or later. No action.
       *Added, the text the design left out:* title "Keep your {n}-day streak";
       body "You haven't studied today. A few cards before midnight keeps it
       going."
7. **A row button "Send feedback about the app":** padding 14, radius 14, 1px
   border.control, transparent, gap 12. An 18px speech-bubble icon
   (accent.text), a column (title at 15px / 600, sub "Bugs, ideas, anything" at
   13px / text.muted), and a 16px chevron-right (#6d7c78). It opens a sheet with
   a textarea, an optional screenshot attachment, and "Send". It posts to
   `/v1/feedback` with the app version, platform and current route.

### Added: the feedback sheet and endpoint
- **The sheet** (info layout, panel padding 10px 22px 24px, gap 16): the title
  "Send feedback"; a textarea (06's editor style, min 5 rows, max 4,000
  characters, required); "Attach a screenshot" as an OutlineButton opening a
  file picker (`accept="image/png,image/jpeg,image/webp"`). A picked image shows
  as a 64px thumbnail with a remove "×". Then "Send" (height 50, radius 12,
  accent), disabled while the text is empty, reading "Sending…" while it runs.
  The Toast "Thanks, feedback sent" closes it. On failure, the sheet stays open
  with the Toast "Couldn't send · Retry", and the text is kept.
- **The screenshot** is a file the learner picks. Mafsar doesn't capture the
  screen (that would need new permissions, hard rule 6). The client downsizes it
  to at most 1600px on the long side, JPEG quality 0.8, and refuses anything over
  1.5 MB after that.
- **`POST /v1/feedback`:** text, an optional image, `appVersion`, `platform`
  (browser plus OS), and `route` (the tab or screen **name only:** never set
  titles, ids or card text). It works signed in or out: signed out, it's
  rate-limited by IP (5 an hour, using prompt 24's IP trust); signed in, 20 a
  day. A 2 MB body limit. Stored in a new `feedback` table (append-only
  migration), with an admin-only `GET /v1/admin/feedback`.
- **Privacy:** update `server/src/privacy.ts`. Feedback text, an optional
  screenshot, the app version, platform and screen name are stored to improve
  the app, and linked to your account if you're signed in.

## Empty state (fewer than 10 reviews ever)
Keep the header and range control. Replace blocks 3–6 with one card (padding
16, radius 16, bg.surface, 1px border.card, column, gap 12): "Your stats appear
after your first few sessions" at 15px / 600 / text.primary, "Review 10 cards to
unlock trends and feedback." at 14px / text.body2, and the PrimaryButton "Start
review" (the same session as Home's). Block 7 (Send feedback) stays.

## Tests (write first)
- The figures on a fixed review log: counts per range, retention with grades 0,
  3, 4 and 5, and time with and without `durationMs`.
- Chart buckets for Week, Month (weeks overlapping 30 days) and All time
  (capped at 12), the current-period marking, and the bar-height formula,
  including the 4px minimum.
- Each insight rule, including its thresholds (just below and just above), the
  priority order and the at-most-3 limit; the code-heavy heuristic.
- Local time buckets at the boundaries (use a fixed time zone in the test).
- The empty state below 10 reviews.
- `durationMs` is recorded, capped, and synced (migration, round-trip, an old
  client doesn't blank it).
- Feedback: validation, the size limit, rate limits signed in and out, route
  names only, and the admin route needs admin.

## Visual check
Harness at 390 × 884, dark mode, next to `05-stats.html`: Week, Month, All
time, the feedback cards, and the empty state.

## Report
As in README rule 12, including why insights run on the device, and the
migration slots you used.
