# Redesign 07: Star ratings, synced (mocks 3a, 3b, 3c)

**Depends on:** 03 (the rating row's place), 00 (SetRow)
**Branch:** `redesign/07-ratings`
**Reference:** `docs/design/reference/03-set-detail.html` (stars under the title), `02-sets.html` (the meta line), `04-discover.html` (rows and preview)
**Read first:** `docs/prompts/redesign/README.md` and `AGENTS.md`.
**Touches:** `server/src/db.ts` (migration), `server/src/app.ts`, `server/src/schema.ts`, `server/src/sync.ts`, `shared/sync-map.js`, a new `src/storage/ratings.js`, `src/sync/api.js`, `src/ui/views/set-detail.js`, the SetRow, `src/ui/panel.css`

Add 1–5 star ratings to sets. The same number shows in the learner's Sets list,
on Set detail and in Discover, with one source of truth on the server. **If
prompt 36 already added ratings, move them onto this model** (see "Migrating
from 36").

## Data model (server)
- **Table `set_ratings`:** `set_root_id`, `user_id`, `stars` (an integer 1–5),
  `created_at`, `updated_at`. Primary key `(set_root_id, user_id)`: one rating
  per user per set, which can be changed.
- **On the root set** (the original a global set was published from), keep the
  denormalised columns `rating_sum`, `rating_count` and `rating_avg =
  rating_sum / rating_count`. Update them **in the same `db.batch(…, "write")`
  transaction** as the upsert or delete, by recomputing from `set_ratings` for
  that root (not by adding increments, which can drift). Never compute them on
  the client.
- **Copies** (a learner who added a global set) have `origin_set_id` → root.
  Every rating read and write for a copy goes to the root. If prompt 35
  already added an origin link, reuse it.
- **A private set** (never published): the owner's rating is stored the same
  way, with `set_root_id` = the set's own id, but it's never included in any
  public aggregate, because the set isn't public.
- **When a private set is made global,** the owner's existing rating becomes
  the first rating in the aggregate (count 1).
- *Added:* when a learner **deletes their copy**, their rating is removed from
  the root's aggregate in the same transaction. The owner deleting the root is
  prompt 09's business (it becomes private first).

## API (under `/v1`, authenticated, rate-limited to about 60 writes a minute per user)
- `PUT /v1/sets/:id/rating` `{ stars: 1..5 }` → `{ yourStars, avg, count }`
- `DELETE /v1/sets/:id/rating` → `{ yourStars: null, avg, count }`
- `:id` is the learner's **own** set id (the original or a copy). The server
  checks ownership and resolves the root. Anything else gets a 404.
- zod validates `stars` as an integer from 1 to 5. Reject 0, 6, 2.5, strings
  and null on PUT.
- **Every set DTO** the client receives (the `/v1/sync` pull, Discover lists
  and preview, the rating responses) includes `yourStars` (null | 1–5),
  `ratingAvg` (a number with one decimal, or null), `ratingCount` (int) and
  `isGlobal` (bool). For a private set, `ratingAvg`/`ratingCount` describe only
  the owner's own rating (count 0 or 1), and the UI shows "Your rating".
- *Added:* **`POST /v1/ratings/lookup`** `{ ids: string[] }` (≤ 200 of the
  learner's set ids) → `{ [id]: { yourStars, ratingAvg, ratingCount, isGlobal } }`.
  A sync pull only returns rows that changed since the last sync, and other
  people rating a set doesn't change *your* row, so without this the averages
  would go stale.

## Sync on the client
- **One store, keyed by root id** (`src/storage/ratings.js`, in `store.js`'s
  account partition): `{ [rootId]: { yourStars, ratingAvg, ratingCount, isGlobal, fetchedAt } }`.
  Every local set knows its root (`originSetId || id`). The Sets list, Home's
  Continue rows, Set detail, the Discover list and the preview all read from
  it. Nothing keeps its own copy.
- **Optimistic update:** write to the store and repaint at once, then call the
  API. On an error, roll back and show the Toast "Couldn't save rating".
- *Added:* **offline.** The change is kept as pending (per root: the latest
  value wins), shown as if saved, and sent on the next `syncNow()` or `online`
  event. A 404 on flush drops it and rolls back.
- **Refresh** the rating fields when the panel becomes visible
  (`visibilitychange`) and whenever the Sets or Discover lists refresh, using
  `/v1/ratings/lookup` for the visible sets. Throttle it to at most once a
  minute.
- The sync schema **rejects** client-pushed `ratingAvg`, `ratingCount` and
  `isGlobal`. `yourStars` is written only through the rating API. Old clients
  and the mobile app must not blank anything (README rule 8).

## UI: Set detail
Under the title and description: a row with gap 8 and margin-left −6px, so the
star glyphs line up with the title.
- **5 star buttons,** each 34×34 (the tap target) holding a 22px star icon.
  Star path: `M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z`.
  Stroke 1.7, round joins.
  - Filled (n ≤ yourStars): fill and stroke rating.star #f0c75e.
  - Empty: no fill, stroke rating.empty #6d7c78.
  - *Added:* hovering over star n previews n filled stars (pointer devices only).
- The group has `role="radiogroup"` and `aria-label="Rate this set"`. Each star
  is `role="radio"`, labelled "1 star" … "5 stars", with `aria-checked`.
  Keyboard: ←/→ change the rating, Delete/Backspace clears it, and only the
  checked star (or the first) is in the tab order.
- Tapping star n sets the rating to n. Tapping the current value again clears
  the rating.
- **The text after the stars** (13px / text.muted):
  - Private, not rated: "Tap to rate"
  - Private, rated: "Your rating · {n}"
  - Global, count 0: "No ratings yet"
  - Global: "Avg {avg} · {count} rating(s)" (the count abbreviated from 1000
    up)
- Learners can rate any set they own or have added. On a Discover preview (a
  set not added yet), the stars are display-only (prompt 09).
- *Added:* **the owner of a global set** rates it like anyone else, and their
  vote counts (rule above). The text shows the global average.

## UI: SetRow meta line (the Sets list and Home's Continue)
- The meta line is flex-wrap, gap 6, 13px / text.muted: "{Source}", then when a
  rating exists "· ★ {avg}{suffix}", then when global "· 🌐 Global".
  - The star is a 12px filled rating.star icon; the average is text.secondary /
    600.
  - Suffix: private → " yours" (the average is your own rating); global → "
    ({count})".
  - The globe is a 12px line icon (circle plus meridian), stroke 2.2,
    `currentColor`. The "🌐" in this text stands for that icon, **not** an
    emoji.
- Don't show "Not started" in this line any more. Progress shows as the bar,
  once it's above 0.

## UI: Discover rows and preview
See prompt 09. They read the same store.

## Formatting (a tested pure function)
- Average: one decimal, always ("4.0", not "4").
- Counts: below 1000 as is; from 1000 up, one decimal plus "k" with a trailing
  ".0" dropped ("1.2k", "12k", "1k"); from a million up, "M" the same way. The
  Discover preview's full count uses thousands separators (`toLocaleString("en-US")`).

## Migrating from 36 (if it landed)
Keep its tables and data if they fit. Otherwise write a new appended migration
that copies its ratings into `set_ratings` and recomputes the aggregates.
Remove its write path (e.g. `yourStars` pushed through sync) so there's only
this one. Say what you found and what you did.

## Tests (write first)
- Server: upsert, change and clear update the aggregates in one transaction;
  copies write to the root; private ratings aren't public; publishing makes the
  owner's rating count 1; deleting a copy removes its vote; ownership is
  checked; zod rejects bad values; lookup returns fresh aggregates; a client
  can't push aggregates through sync.
- Client: an optimistic update everywhere from one store; rollback and the
  toast on error; an offline queue flushed on sync; the lookup is throttled.
- UI: radiogroup semantics and keyboard; re-tap clears; the four text states;
  meta-line suffixes; the formatting function.
- The migration fingerprint and count; a mobile round-trip keeps its fields.

## Visual check
Harness at 390 × 884, dark mode: the stars under the title (unrated, rated,
global) next to `03-set-detail.html`, and a rated private and a rated global
SetRow next to `02-sets.html`.

## Report
As in README rule 12, including what you reused or migrated from 36.
