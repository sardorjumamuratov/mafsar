# Redesign 09: Make it global, and the Discover tab (mocks 3a, 3c)

**Depends on:** 07 (ratings, `origin_set_id`), 08 (categories, interests), 03 (the ⋯ sheet)
**Branch:** `redesign/09-global-discover`
**Reference:** `docs/design/reference/04-discover.html`, `03-set-detail.html` (the ⋯ menu and confirm sheet), `logic.js` (ranking, labels, states)
**Read first:** `docs/prompts/redesign/README.md` and `AGENTS.md`.
**Touches:** `server/src/db.ts` (migrations), `server/src/app.ts`, `server/src/schema.ts`, `server/src/sync.ts`, `server/src/privacy.ts`, `shared/sync-map.js`, a new or replaced `src/ui/views/discover.js`, `src/ui/views/set-detail.js`, `src/ui/views/you.js`, `src/sync/api.js`, `src/background/service-worker.js`

Let learners publish sets to a global catalogue, and add the Discover tab,
where they find global sets ranked by their interests and by rating.

**If prompt 35 landed** (the `/v1/global/*` routes, a Global view, its
tables): restyle and extend it to this spec. Keep its data (with a migration
where the model differs), and **remove its category chips and `category`
query parameter.** Categories must never reach the client (08). Say what you
reused.

## A. The Set detail "⋯" sheet
03 built this sheet (panel padding 10px 12px 24px, gap 2, grabber
margin-bottom 10, no title). Rows: flex, gap 14, padding 12, radius 12,
transparent, left-aligned. Hover/press background bg.surface2. A 36×36 icon
tile (radius 10, bg.surface2), then a text column.

**Rows in order** (this prompt adds 1 and 2 in front of 03's rows):
1. **Globe icon** (accent.text), title at 15px / 600, description at 13px /
   text.muted.
   - Private set: "Make it global" / "Share this set in Discover". Opens the
     confirm sheet (B).
   - Global set, for the owner: "Make private" / "Remove from Discover.
     Existing copies stay." Applies immediately, closes the sheet, and shows
     the Toast "Set is private again".
   - Hidden on sets the learner added from Discover (they're not the owner).
   - *Added:* **sets that aren't the learner's own work** (source `quizlet`, a
     CSV/Anki import, `shared`) show the row at 45% opacity, not tappable, with
     the description "Only sets you made can be shared". The server enforces
     this too (C).
   - *Added:* signed out, the description reads "Sign in to share in
     Discover", and tapping opens You.
2. **Pencil icon, "Rename set".** Renames inline in the header title, using
   prompt 06's pattern: an input in place of the title (27px / 650 /
   line-height 1.15 / −0.02em, bg.app, 1px accent border, radius 10, padding
   6px 10px), with Cancel / Done (06's buttons). Enter or ⌘/Ctrl+Enter saves,
   Esc cancels, and an empty or over-60-character title disables Done.
   - *Added:* renaming sets a synced **`renamed`** flag on the set (a new
     field, README rule 8), so regeneration never overwrites a name the learner
     chose (02).
3. **Regenerate cards** · 4. **Set type** (from 03).
5. **Trash icon, "Delete set"** in danger.text. Deletes with a Toast + Undo, as
   with cards (03). An owner deleting a global set: it becomes private first,
   and copies stay.

## B. The confirm sheet: "Make this set global?"
- Panel padding 10px 22px 24px, gap 16.
- Title at 18px / 650. Body at 14px / line-height 1.45 / text.body2: "It will
  appear in Discover for learners with similar interests. Anyone can add a copy
  and rate it."
- Two lines (gap 10, 14px / line-height 1.4, each with an 18px leading icon):
  - A check icon (accent.text, stroke 2.4): "**Shared:** title, {n} cards,
    summary, your display name"
  - A lock icon (text.muted): "**Stays private:** your progress, schedule and
    exam date"
- A note at 13px / text.muted: "You can make it private again anytime. People
  who already added it keep their copy."
- Buttons (column, gap 8):
  - "Make global": height 50, radius 12, background accent, text accent.on,
    15px / 650. While the request runs it reads "Publishing…" and is disabled.
  - "Cancel": height 48, radius 12, background bg.segmentActive, text.primary,
    15px / 600.
- **On confirm:**
  - `POST /v1/sets/:id/publish`.
  - Close the sheet, show the Toast "Now in Discover", and add a **"Global"
    chip** to the header meta row next to the source chip. The chip: padding 3px
    9px, radius 999, bg.surface2, text.secondary, 12px / 600, gap 5, with a
    12px globe icon.
  - On a 422 or a safety block, the sheet closes and the server's message shows
    as a toast (C).

### Added: the display name
The design shares "your display name", but Mafsar has none yet:
- `users.display_name` (a migration), set with `PUT /v1/me/display-name`
  (plain text, 2–40 characters, trimmed). It defaults to the first name from
  Google sign-in if there is one, otherwise "A Mafsar learner". **The email is
  never shown or used as a name.**
- You gets a row (13's `.setting-row` pattern) "Name in Discover" / "{name}",
  which opens a small sheet to edit it.
- In the confirm sheet, "your display name" is followed by "({name})", and a
  "Change" text button (accent.text) opens that sheet.

## C. Publish rules (server)
- `sets.visibility`: `'private' | 'global'`, plus `published_at` and
  `unpublished_at`.
- **Publishing needs** at least 5 live cards, and a title that's been cleaned
  (no raw transcript prefix). Otherwise the server returns a 422 with a message
  the client shows as a toast ("A set needs at least 5 cards to be shared",
  "Give this set a clearer title first"). The server can't import `shared/`, so
  port `cleanTitle`'s check to the server, with a test that the two agree (like
  `tests/sync-limits.test.mjs`).
- *Added:* **the source rule:** a 422 for sets from `quizlet`, CSV/Anki imports,
  `shared`, and copies from Discover. Only a learner's own captures, pasted
  text and hand-made sets can go global.
- **An automated content-safety check on publish:** one classification call to
  the **existing** provider (no new third party), asking whether the title,
  summary and cards contain hate, sexual content involving minors, personal
  data about private people, or spam. It counts against 08's rate discipline.
  Flagged sets stay private, and the owner sees the Toast "This set can't be
  shared". *Added:* if the provider fails, don't publish unchecked. Return 503
  "Couldn't check this set right now. Try again in a few minutes."
- *Added:* publishing is rate-limited to 10 a day per user.
- **Make private:** visibility → private. The set leaves Discover at once (see
  the cache rule in F). Existing copies keep working, and their ratings keep
  syncing to the root (the root is just unlisted).
- **Copies:** "Add to my sets" creates a set the learner owns, with
  `origin_set_id = root`, copies the cards, and starts every card as New in the
  learner's own schedule.
  - *Added: how, in Mafsar:* `POST /v1/discover/:rootId/add` creates the copy
    **on the server** (new ids, `origin_set_id`, and `origin_card_id` on every
    card) and returns it in the `/v1/sync` pull shape. The client writes it
    through `sync-map`'s `fromServer`, so it appears at once and is already
    synced. It's idempotent: adding again returns the existing copy.
- ***Added:* owner edits reach copies** (prompt 06 promises it):
  - Copy cards carry `origin_card_id` and a synced **`detached`** flag. Editing
    a copy's card in prompt 06's editor sets `detached = true` on it.
  - When a sync push changes the front or back of a card in a root that's
    global or unlisted, the server updates every copy card with that
    `origin_card_id` where `detached = 0` and it isn't deleted, and bumps its
    `server_updated_at` so it syncs down. Cards the owner **adds** are added to
    each copy as New cards. Cards the owner **deletes** stay in copies (never
    destroy a learner's reviews). Schedules are never touched.
  - This fans out in the background, in batches of at most 500 rows, so the
    owner's sync stays fast.
  - Titles and descriptions of copies are the learner's own and don't follow the
    owner.

## D. The Discover tab (the new nav tab; mock 3c)
- Scroll container: padding 18px 16px 24px (plus clearance for the docked
  bars), column, gap 14. The capture dock and nav sit at the bottom, with
  Discover active.
- **Header** (padding 0 4px, gap 2): "Discover" at 24px / 650 / −0.02em (the
  `<h1>`); "Sets shared by other learners, picked for you" at 13px /
  text.muted.
- **Search field:** the same component as on Sets, with the placeholder "Search
  global sets". It searches titles and card text on the server, debounced
  250ms.
- **Segmented control** (the same as Set detail's tabs): "For you" | "Top rated"
  | "New". The choice is remembered for the session.
- **List:** column, gap 8. A global row is the SetRow layout, with these
  differences:
  - Meta: "by {author display name} · {n} cards". In the New tab: "by {author}
    · {n} days ago" ("today", "1 day ago").
  - Right column: "★ {avg}" at 15px / 700 / text.primary with a 13px filled
    rating.star icon (gap 4), and under it "{count}" at 11px / text.muted,
    abbreviated (1.2k), from 07's formatter. With no ratings: "New" at 13px /
    600 / text.muted.
  - **Already added:** the right column becomes a 14px check plus "Added" at
    13px / 600 / accent.text.
  - No progress bar on global rows.
- Exclude the learner's own sets from Discover. Sets they've added stay, marked
  "Added".
- **Empty search:** centred, 14px / text.muted: No global sets match "{query}".
- **Pagination:** infinite scroll (an `IntersectionObserver` on a sentinel), 20
  per page, with a skeleton of 3 rows while loading.
- Tapping a row opens the Preview sheet (E).
- *Added, states the design doesn't show:*
  - **Signed out:** the header, then a card (01's no-sets card style): "Sign in
    to discover sets" / "See sets other learners made, picked for what you
    study.", with an OutlineButton "Sign in" that opens You.
  - **Offline:** show the last list from a local cache (per tab, first page
    only, painted first like every view), with a line at 13px / text.muted:
    "You're offline. Showing sets from earlier." With nothing cached: "Discover
    needs a connection."
  - **An empty catalogue** (For you or New with no results): "No shared sets
    yet. Make one of yours global from its ⋯ menu."

## E. The Preview sheet
- A BottomSheet, max-height 86%, scrolling inside. Panel padding 10px 20px
  24px, gap 16.
- **Header row** (gap 14): a 48×48 source tile (radius 12, 13px / 700). Next
  to it, a column (gap 4): the title at 20px / 650 / line-height 1.2, and "by
  {author} · {n} cards" at 13px / text.muted.
- **Rating row** (gap 8): 5 display-only 18px stars (the rounded average), then
  "{avg}" at 14px / 600, then "· {count, in full with thousands separators}
  ratings" at 13px / text.muted. With no ratings: "No ratings yet". Once the
  learner has added the set, the stars become 07's interactive control for
  their own rating.
- **Reason callout:** padding 12px 14px, radius 12, bg.surface2, 14px /
  text.secondary: "Picked because you study **{title of the learner's most
  related set}**".
  - The related set is the learner's set with the same category (or the same
    parent) and the most reviews in the last 30 days. The server returns only
    that set's **title** (`reasonSetTitle`), never an id or category.
  - In the Top rated and New tabs, leave the callout out when there's no
    related set.
  - **Never show the category name.**
- **"SAMPLE CARDS"** (SectionLabel style), then the first 3 questions: rows with
  an 8px New dot, 15px text, a 1px divider, padding 10px 0.
- **Primary button:**
  - Not added: "Add to my sets" (height 52, radius 14, accent). It creates the
    copy (C) and switches to the Added state. The learner stays in the sheet.
    While the request runs it reads "Adding…".
  - Added: "✓ Added · Open set" (height 52, radius 14, bg.surface2, 1px
    border.hover, accent.text, 16px / 650). It goes to the copy's Set detail.
- **A text button "Report this set"** (13px / text.muted, height 32, centred).
  It opens a report sheet with the reasons Wrong answers, Spam, Offensive,
  Copyright and Other (Other adds an optional note of up to 300 characters),
  and sends `POST /v1/sets/:rootId/report`. Then the Toast "Thanks, we'll take a
  look".
- *Added, moderation* (the design has a report button but nothing behind it):
  - One report per user per set.
  - After **3 distinct reporters,** the set is hidden from Discover pending
    review.
  - Admin-only routes (`isAdminEmail`): `GET /v1/admin/reports`, and
    `POST /v1/admin/sets/:id/hide|restore|remove`.
  - Report sending is rate-limited.

## F. Ranking (server: `GET /v1/discover?tab=for|top|new&q=&cursor=`)
- **Weighted rating** (a Bayesian average, so one 5★ rating can't beat 500
  ratings of 4.8):
  `score_rating = (C × m + rating_sum) / (C + rating_count)`, with **C = 20**
  and **m** = the mean rating across all global sets (recomputed hourly by a
  timer, with a default of 4.0 until any ratings exist).
- **"For you":** `score = interest(user, set.category) × score_rating`, with
  `published_at` descending as a tie-break.
  - `interest` = the learner's normalised weight for the category, plus 0.5 ×
    the weight of its parent, floored at 0.05 so unrelated sets can still
    appear.
  - **Diversity:** no more than 3 sets from the same category in any window of
    10 results.
- **"Top rated":** `score_rating` descending (interests ignored), with a minimum
  of 3 ratings.
- **"New":** `published_at` descending, with no minimum.
- **New users with no interests:** For you = Top rated.
- **Always excluded:** the learner's own sets, hidden or removed sets, and
  private sets.
- **Search (`q`):** it filters within the chosen tab's ranking (title and card
  text, case-insensitive).
- **The cursor** is opaque and stable across pages, so nothing repeats or is
  skipped.
- **Cache per user for 10 minutes.** Invalidate it when the learner adds or
  rates a set. *Added:* the cache key also includes a global **catalogue
  version,** bumped on every publish, make-private, hide and remove, so a set
  made private leaves everyone's Discover within a minute (prompt 11 checks
  this).
- **The response never includes** `category`, owner ids or emails, schedules,
  or other learners' ratings. It includes `yourStars`, `ratingAvg`,
  `ratingCount`, `isGlobal`, `added`, the author's display name, the card count,
  `published_at`, the source (for the tile) and `reasonSetTitle`.

## G. Everywhere else
- **Sets filter** (02): Global and Private now appear. A set counts as **Global**
  when it's the learner's published set, or a copy added from Discover.
- **SetRow and Set detail:** "🌐 Global" in the meta line (07) and the Global
  chip use the same rule.
- **Privacy** (`server/src/privacy.ts`): publishing makes the set's title,
  cards, summary and your display name visible to other users; reports are
  stored; your study activity by subject is used to rank Discover. There's no
  new third party.
- **Terms:** list in your report that the terms page (prompt 03, not done yet)
  needs a user-content clause before this ships.

## Tests (write first)
- Publish: the 5-card rule, the cleaned-title rule (client and server agree),
  the source rule, the safety block and the provider-failure 503, the rate
  limit.
- Make private: gone from Discover through the catalogue version; copies keep
  working and their ratings still reach the root.
- Add: a server-side copy with origin ids, idempotent, New schedules.
- Propagation: an owner's edit reaches undetached copies only; an owner's new
  card is added; an owner's delete leaves copies alone; schedules untouched.
- Rename: the `renamed` flag syncs, and regeneration keeps the name.
- Ranking: the Bayesian formula (1 × 5★ ranks below 500 × 4.8), the interest
  floor, diversity, Top rated's 3-rating minimum, the new-user fallback, own
  sets excluded, a stable cursor.
- Reports: one per user; hidden after 3; the admin routes need admin.
- No `category`, owner id or email in any Discover response.
- UI: the signed-out, offline and empty states; the Added state persists;
  display-name defaults and validation.
- Migration fingerprints and count; the mobile round-trip keeps the new set and
  card fields.

## Visual check
Harness at 390 × 884, dark mode, next to `04-discover.html`: each tab, a row
with ratings, an Added row, the preview sheet (not added and added), and the ⋯
sheet plus the confirm sheet next to `03-set-detail.html`.

## Report
As in README rule 12, plus the ranking and moderation notes, what you reused
from 35, the migration slots, and the terms note.
