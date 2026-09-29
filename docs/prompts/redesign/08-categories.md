# Redesign 08: AI category per set (server only, never shown)

**Depends on:** — (run after 07 so migrations don't collide)
**Branch:** `redesign/08-categories`
**Reference:** none (no UI)
**Read first:** `docs/prompts/redesign/README.md` and `AGENTS.md`.
**Touches:** `server/src/db.ts` (migrations), a new `server/src/categories.ts`, `server/src/llm.ts`, `server/src/sync.ts`, `server/src/index.ts` (timers), `server/src/app.ts`, `server/src/privacy.ts`

Give every set a category assigned by AI. It's used only for ranking and
interest matching. It must **never** appear in any UI, and never in any API
response the client can read.

**The category is the topic of the flashcards' content,** decided from what
the questions and answers are about: e.g. "Networking", "Java", "Public
speaking", "Immunology". It is **not** the source app. AI Studio, YouTube,
ChatGPT and Quizlet are sources and are never categories. Two sets about Java,
one captured from YouTube and one from ChatGPT, must get the same category.

**If prompt 34 landed** (`sets.category` as a text slug, possibly `topic`),
build on it: seed the table below, backfill `category_id` from matching slugs,
mark the rest for re-categorisation, and switch every reader to `category_id`.
Old columns stay (migrations are append-only). Just stop writing them.

## Data
- **Table `categories`:** `id`, `slug` (unique), `name`, `parent_id`
  (nullable, for a two-level tree), `created_at`, `created_by` (`'seed'` |
  `'ai'`).
- **Seed** it in the migration with this tree (about 65 entries). *Added: the
  document asked for "about 60" without listing them.* Adjust it if you have a
  reason, and say why:
  - **Medicine:** Anatomy, Physiology, Pharmacology, Pathology, Cardiology,
    Neurology, Clinical medicine, Medical licensing exams
  - **Nursing**
  - **Biology:** Cell biology, Genetics, Immunology, Microbiology, Ecology
  - **Chemistry:** General chemistry, Organic chemistry, Biochemistry
  - **Physics:** Mechanics, Electromagnetism
  - **Mathematics:** Calculus, Linear algebra, Statistics & probability
  - **Computer Science:** Networking, Algorithms & data structures, Operating
    systems, Databases, Security, System design
  - **Programming:** Java, Python, JavaScript & TypeScript, C & C++, Web
    development, Mobile development
  - **Data & AI:** Machine learning, Data analysis
  - **Engineering:** Electrical, Mechanical, Civil
  - **Business:** Economics, Finance, Accounting, Marketing, Management
  - **Law**
  - **Humanities:** History, Philosophy, Literature, Art & music
  - **Social sciences:** Psychology, Sociology, Political science, Geography
  - **Languages:** English speaking, English grammar & vocabulary, Spanish,
    German, French, Other languages
  - **Test prep:** School and university entrance exams, Language exams
  - **Skills:** Public speaking, Writing, Productivity, Consumer tech
  - **Other**
- **On `sets`:** `category_id` (FK), `category_confidence` (0–1),
  `category_model` (string), `categorised_at`. *Added:* also
  `categorised_card_count` (for the 30% rule) and `category_stale` (0/1).
- **The public DTO serialisers explicitly exclude** `category_id`,
  `category_confidence`, `category_model`, `categorised_*` and any old
  `category`/`topic` column. Add a test that fails if any client-facing
  endpoint returns a field containing "category".
  - *Added:* the one existing exception is the **quota error**
    (`{ error: "quota_exceeded", category: "set" | "coding" | "practice" }`
    from `billing/core.ts`). That's a billing bucket, not this category, and
    changing its name would break shipped clients. The test allow-lists exactly
    that key on exactly that error.
  - The test covers at least `/v1/sync` (pull), `/v1/share/:code`, every
    Discover or Global route, the rating routes (07), and error responses.

## The assignment job
- **Triggers:** a set is created; its title or description changes; or its
  card count changes by more than 30% since the last categorisation. The server
  sees all of these as rows arriving through `/v1/sync`: set
  `category_stale = 1` there. It runs asynchronously; creating a set (and the
  sync that carries it) never waits for it.
- *Added: how "background queue" works here.* One in-process worker, started in
  `index.ts`, picks the oldest stale or uncategorised sets from the database on
  a timer. The database is the queue, so a restart or deploy loses nothing.
- **Model input:** title, description, and up to 20 question/answer pairs,
  plus the current category list (id and path).
  - *Changed from the document* (which said up to 4k tokens): cap the whole
    input at about **2,000 tokens**. The provider's free tier (Groq) allows
    **8,000 tokens a minute, including the completion budget,** shared with
    every learner's generation. A 4k-token call per set would starve them. Trim
    the pairs, not the category list.
  - Ask for a small completion (about 80 tokens).
- **The model must return JSON:** `{ "category_id": <existing id> | null,
  "new_category": { "name", "parent_id" } | null, "confidence": 0–1 }`.
  Validate it: an unknown `category_id` counts as a failure; names are trimmed,
  plain text, at most 40 characters; `parent_id` must be a top-level seed or
  null.
- **Prefer existing categories.** Create a new one only when the confidence for
  every existing category is below 0.5, and cap new categories at **20 a day**.
  Past the cap, the set goes to "Other" and is logged for review.
- **Retries:** up to 3, with backoff. On the final failure: "Other" with
  confidence 0, retried again after 24h.
- **Rate discipline (added):** at most one categorisation call every 30s. After
  a 429, pause the worker for 5 minutes. A learner's generation always goes
  first: if a generation ran in the last 10s, skip this tick. Use the existing
  provider client and `LLMError`. No new provider.
- **When a global set is copied,** the copy inherits the root's category
  without a model call. A copy is recognised by `origin_set_id` (prompts 07 and
  09) when it first arrives through sync.

## User interests (server)
- **Table `user_interests`:** `user_id`, `category_id`, `weight` (float),
  `updated_at`. Primary key `(user_id, category_id)`.
- **Recompute nightly and after each review session:**
  `weight = Σ over the user's sets in that category of (reviews in the last 30 days + 5 if created or added in the last 30 days)`,
  multiplied by the decay factor `0.5^(days_since_last_activity / 30)`, where
  the last activity is the newest review or add in that category. Reviews map
  to sets through `review_log.card_id → cards.set_id`.
  - Parent categories also get 50% of their children's weight.
  - Normalise the weights per user so they sum to 1.
- *Added: how "nightly" and "after each session" work here.* An hourly timer in
  `index.ts` runs the nightly pass when 24h have passed since the last one (the
  last run time is stored in the database, so a restart doesn't re-run or skip
  it). Batch it to at most 200 users per tick. "After a session" means a sync
  push containing review rows. Debounce it per user (60s), then recompute that
  user.
- Interests are never shown in the UI, and never returned by any endpoint.

## Privacy
Update `server/src/privacy.ts`: we classify each set's subject with the same AI
provider that writes its cards, and use your study activity by subject to
recommend shared sets. The data isn't sold or shared, and there's no new third
party.

## Tests (write first)
- The seed tree is present, two levels deep, with unique slugs.
- The triggers: create, title change, description change, a card-count change
  over 30% (and not at 29%).
- Validation: unknown id → failure → retry → "Other"; the new-category rule (all
  below 0.5) and the daily cap of 20.
- Rate discipline: spacing between calls, the pause after a 429, skipping when a
  generation just ran (fake clock).
- A copy inherits the root's category with no model call.
- The interest formula on a fixed dataset: decay, the parent's 50%, weights
  summing to 1; the debounced recompute after a sync with reviews.
- **No client-facing response contains "category"**, apart from the
  allow-listed quota error.
- Migration fingerprints and the count.

## Verify
README rule 12. If you have a provider key, run one real categorisation by
passing the key inline (never write it to a file), and paste the input size and
the output.

## Report
As in README rule 12, plus the token budget per call, and the migration slots
you used.
