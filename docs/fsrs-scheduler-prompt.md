# Mafsar — FSRS Scheduler + Insights Build Prompt

> **Copy everything below into a fresh coding session, in the Mafsar repo.**

---

You are replacing Mafsar's **SM-2** spaced-repetition scheduler with **FSRS** (Free Spaced Repetition Scheduler, the algorithm modern Anki uses). Then you'll use the same model to build the stubbed `GET /v1/insights` endpoint. Mafsar is an MV3 browser extension (Chrome + Firefox) written in vanilla JS ES modules with **no build step**. It also has a Hono + libSQL (Turso) TypeScript backend in `server/`. Match the existing code style, comment density and test conventions.

## Why

FSRS models each card's memory with two numbers: **stability** (how many days until recall probability drops to 90%) and **difficulty**. Each review is then scheduled for the day predicted recall hits a target retention. For the same retention, users do noticeably fewer reviews than with SM-2. The model also gives a **retrievability** number (current recall probability) for every card. That number is the "forgetting model" `/v1/insights` has been waiting for.

## What exists today (read these first)

- `src/storage/srs.js`: SM-2. `initSchedule`, `review(card, grade, now, examDate)`, `isDue`, `byDue`, `masteryOf`. Cards store `easiness`, `interval` (days), `repetitions`, `dueDate` (epoch ms). `review()` clamps `dueDate` to half a day before a future `examDate`, and never less than ~10 min out. **Keep that behaviour.**
- `src/ui/flows/review.js`: the grade buttons send grades **0 / 3 / 4 / 5** (Again / Hard / Good / Easy). `gradePreview()` shows each button's interval. `gradeCard()` calls `review()`, then `updateCard()`, then `appendReviewLog({ id, cardId, sessionId, grade, prevInterval, newInterval, reviewedAt })`. It also requeues lapsed cards within the sitting, but that requeue is not stored.
- `src/ui/flows/typed.js`, `apply.js`, `coding.js`: these also append review-log rows (grade `4` or `1`, `prevInterval: 0, newInterval: 0`), but they **do not change the card's schedule**. When you replay the log they must be told apart from real flashcard reviews (see below).
- `src/storage/store.js`: `reviewLog` is capped at the last 2,000 entries. That makes the local log incomplete for old cards, so card state must be stored on the card, not rebuilt from the log.
- `src/storage/readiness.js`: `examReadiness()`, `nextExam()`, and `weakTopics()`. `weakTopics()` currently guesses forget-risk from `easiness < 2.5` plus "due within 3 days".
- `masteryOf()` is used in `src/ui/core.js` (Home % mastered, readiness) and `src/ui/views/set-detail.js`. The server mirrors it in `server/src/teams.ts` (`repetitions >= 3 OR (repetitions >= 2 AND interval >= 6)`), and **the two must stay in sync**.
- Sync: `src/sync/map.js` (`toServer` / `applyServer`), `server/src/schema.ts` (zod), `server/src/sync.ts` (card upsert, review_log insert-or-ignore), and `server/src/db.ts` (append-only `MIGRATIONS` list). Server `cards` has `easiness, interval, repetitions, due_date`. Server `review_log` has `id, user_id, card_id, grade, prev_interval, new_interval, reviewed_at`, with no `session_id`.
- The card merge in `src/background/service-worker.js` (~line 65) keeps a card's schedule fields when a set is regenerated. It must carry the new fields too.
- `server/src/app.ts` ~line 317: `GET /v1/insights` returns `501 not_implemented`. `server/tests/api.test.ts` (~line 255) asserts that 501, so update it.
- Tests: `tests/srs.test.mjs`, `tests/sync-map.test.mjs`, `tests/store.test.mjs` (plain node), and `server/tests/*.test.ts` (vitest).

## Build this, in order

### 1. FSRS core (`src/storage/srs.js`)
- Implement **FSRS-6** with the published default parameters (21 weights). Write it as a pure, dependency-free function (no npm package, since the extension has no bundler). Credit the reference (open-spaced-repetition `ts-fsrs` / the FSRS wiki) in a comment, and put the default weights in one exported constant.
- Card fields to add: `stability` (days), `difficulty` (1–10), `state` (`"new" | "learning" | "review" | "relearning"`), `lapses`, `lastReview` (epoch ms). Keep `interval`, `dueDate` and `repetitions` (reps count) up to date because the UI, sync and teams still read them.
- Grade mapping: button grade `0 → Again(1)`, `3 → Hard(2)`, `4 → Good(3)`, `5 → Easy(4)`. Treat any other `< 3` value as Again, so the `1` from typed/apply/coding still maps.
- Keep the `review(card, grade, now, examDate)` signature and return shape (spread-able into `updateCard`), so `review.js` and `gradePreview` keep working unchanged. Keep the exam-date clamp exactly as it is now.
- Target retention is `0.9` by default, with a max interval of 365 days. Round intervals to whole days, with at least 1 day for review-state cards. Put interval fuzz behind a flag and default it **off**, so `gradePreview` matches what actually gets scheduled.
- Export `retrievability(card, now)`. For cards that have never been reviewed, return `null`.
- **Migrating existing SM-2 cards:** a card that has `repetitions > 0` but no `stability` must be converted lazily on its first FSRS review, without resetting it. Seed `stability` from the current `interval` (at least 1 day) and `difficulty` from `easiness` (linear map: 1.3 → 10, 2.5 → 5, ≥3.0 → 1, clamped). Set `state = "review"`. Don't do a bulk rewrite of storage. If `easiness` has nothing left reading it, keep writing it anyway so older clients still sync cleanly.
- `masteryOf()` must return the same three buckets. Define "mastered" as `state === "review" && stability >= 7`. Fall back to the old SM-2 rule for cards without `stability`. Update `server/src/teams.ts` to the same rule in SQL.

### 2. Storage, sync and server schema
- Review-log rows gain `kind: "flashcard" | "typed" | "apply" | "coding"` (default `"flashcard"` for old rows), plus `stability` and `difficulty` **after** the review, so the server can replay history. Set `kind` in all four flows.
- Carry the new card fields through `toServer` / `applyServer`, zod `schema.ts`, `sync.ts` upsert/select, and the service-worker regenerate merge. They must stay optional/nullable so an older extension build syncing against the new server (and the reverse) doesn't break. Add a sync test for a mixed-version round trip.
- Add one new migration to the **end** of `MIGRATIONS` in `server/src/db.ts`: `ALTER TABLE cards ADD COLUMN` for `stability REAL`, `difficulty REAL`, `state TEXT`, `lapses INTEGER NOT NULL DEFAULT 0`, `last_review TEXT`, and `ALTER TABLE review_log ADD COLUMN` for `kind TEXT NOT NULL DEFAULT 'flashcard'`, `stability REAL`, `difficulty REAL`. Never edit earlier migrations.

### 3. Client insights (`src/storage/readiness.js`)
- Rewrite `weakTopics()`'s `forgetRisk` using FSRS: a card is at risk when its retrievability **3 days from now** is below `0.8`. Also return `recall` (current retrievability, 0–1) and `forgetBy` (the epoch ms when R crosses 0.8). Fall back to the old heuristic for cards that have no FSRS state yet.
- Make exam readiness FSRS-aware: add an optional `predictedRecallAtExam` (mean R over the set's reviewed cards, evaluated at `examDate`). Show it in the set-detail readiness panel only when a meaningful share of the set has FSRS state. Keep the existing `examReadiness()` fields unchanged.

### 4. `GET /v1/insights` (server)
- Replace the 501 stub with a real endpoint, computed only from data the server already has for the authenticated user (`cards`, `sets`, `review_log`). Put the pure FSRS math in a server module (for example `server/src/fsrs.ts`), ported from the client file and backed by **shared test vectors**. That way client and server agree to the day on the same inputs.
- Response (camelCase, matching the rest of the API):
  ```json
  {
    "generatedAt": "ISO",
    "retention": { "target": 0.9, "observed30d": 0.87, "reviews30d": 212 },
    "weakTopics": [{ "cardId": "", "setId": "", "front": "", "lapses": 3, "recall": 0.62, "forgetBy": "ISO" }],
    "forecast": [{ "day": "YYYY-MM-DD", "due": 14 }],
    "exams": [{ "setId": "", "title": "", "examDate": "ISO", "daysLeft": 6, "predictedRecall": 0.81, "cards": 40, "reviewed": 31 }]
  }
  ```
  - `observed30d` is the share of `kind='flashcard'` reviews in the last 30 days with grade ≥ 3, where the card was already in review state. It is `null` if there are fewer than 20 reviews.
  - `weakTopics` holds at most 10 non-deleted cards, lowest predicted recall 3 days out first.
  - `forecast` covers the next 14 days of due counts, bucketed by UTC day.
  - `exams` includes only sets with a future exam date.
- Exclude deleted cards and sets. Cap the work per request, the way other endpoints do. Use the existing auth middleware.
- Tests: replace the 501 assertion. Add vitest cases for an empty account (a valid response with empty arrays and null retention), a seeded account with known FSRS state (deterministic values), and a check that one user never sees another user's cards.
- Parameter optimisation (fitting per-user weights from `review_log`) is **out of scope**. Leave a TODO where per-user weights would plug in.

### 5. Tests (client)
- `tests/srs.test.mjs`:
  - Grade mapping.
  - FSRS state transitions (new → learning/review, lapse → relearning, `lapses` increments).
  - Intervals grow for Good and are ordered Again < Hard < Good < Easy.
  - The exam clamp still holds.
  - An SM-2 card migrates without resetting (a card at a 20-day interval graded Good gets a longer interval, not 1 day).
  - `retrievability` is 0.9 at `t = stability`.
  - `masteryOf` buckets.
- Pin a handful of known input → output vectors against the reference implementation. Use the same vectors in the server test.
- Keep all existing tests passing: run `node --test tests/` (or however `package.json` runs them) and `npm test` in `server/`.

## Constraints
- No build step and no new runtime dependencies in the extension. FSRS must stay pure (no `chrome.*`), so node tests can import it.
- Don't change the review UI's look. The grade buttons and their day previews stay, and only the numbers change.
- Old extension builds and old synced data must keep working. Nothing may reset a user's existing progress.
- Commit in logical steps (core → sync/schema → client insights → server insights), with tests at each step.

## Done when
- Grading a card uses FSRS, previews match the scheduled intervals, and existing SM-2 cards carry their progress over.
- New fields round-trip through sync in both directions and across mixed versions.
- The Insights card on Home/You shows FSRS-based "likely to forget by …" predictions.
- `GET /v1/insights` returns the response above with tests, and nothing in the repo still says "not implemented" for it.
