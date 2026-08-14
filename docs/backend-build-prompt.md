# Mafsar — Backend Plan & Build Prompt

This document has two parts:
1. **The plan** — lightweight stack, architecture, data model, endpoints, phases.
2. **The build prompt** — a self-contained spec you can hand to a coding agent (e.g., Claude Code) or a developer to implement it.

---

## Part 1 — The plan

### Stack (lightweight, cheap, portable)
- **TypeScript on Node**
- **Hono** — tiny, fast web framework (portable to Bun / Cloudflare Workers later)
- **SQLite via `better-sqlite3`** for local/dev → **Turso / libSQL** for hosting (real SQL, durable, near-zero ops)
- **zod** — request validation
- **JWT via `jose`** + **`bcryptjs`** — stateless auth, no session store
- **Upstash Redis** *(optional, later)* — rate limiting + streak leaderboards (sorted sets)
- Deploy on **Fly.io / Render / Railway** (free-ish tiers)

### Architecture
```
Extension ─┐
Mobile app ─┼─▶ Hono API ─▶ SQLite/libSQL (source of truth)
Web app    ─┘        │
                     └─▶ LLM provider (Gemini/Groq/Claude) via server key
```
Offline-first: the extension keeps `chrome.storage` as the local cache; the API adds sync. **An account is optional — the app must keep working fully offline without login.**

### Data model (SQLite)
- `users(id, email, password_hash, created_at)`
- `sets(id, user_id, title, source, source_label, mode, exam_date, created_at, updated_at, deleted)`
- `cards(id, set_id, front, back, easiness, interval, repetitions, due_date, updated_at, deleted)`
- `quiz(id, set_id, question, options_json, answer, explain, updated_at, deleted)`
- `activity(user_id, day, count)` — streaks
- `review_log(id, user_id, card_id, grade, prev_interval, new_interval, reviewed_at)` — **seeds the personalized forgetting model / analytics moat**
- *(Phase 3)* `teams`, `team_members`, `shared_sets`

### API (v1)
Auth: `POST /v1/auth/register`, `POST /v1/auth/login`, `GET /v1/me`
Sync: `POST /v1/sync` (offline-first, last-write-wins by `updated_at`, tombstones for deletes)
Generation (LLM proxy, server key, rate-limited, **mode-aware**):
- `POST /v1/generate` — transcript/source → flashcards + quiz + summary
- `POST /v1/grade` — grade a typed short answer / IRAC against a rubric (AI assessment)
- `POST /v1/hypothetical` — generate a fresh fact-pattern/scenario for a rule/concept (adaptive practice)
Analytics: `GET /v1/insights` — weak topics, readiness vs. exam date, forgetting predictions (from `review_log`)
Teams *(Phase 3)*: `POST /v1/teams`, `POST /v1/teams/:id/invite`, `GET /v1/teams/:id`

### Modes
Server holds prompt templates per **mode**: `general`, `coding`, `law`, `medicine`. `generate`/`grade`/`hypothetical` all take a `mode` param that selects the template and card types (e.g., law → IRAC rule cards + hypotheticals).

### Phases (build in order)
1. **Scaffold + auth + sync** (sets/cards/quiz/activity/review_log) — the multi-device core.
2. **LLM proxy** (`generate`/`grade`/`hypothetical`) with modes — no-API-key onboarding + assessment.
3. **Analytics** (`/insights`: weak topics, exam readiness, forgetting model v1).
4. **Teams + Redis** (shared sets, streak leaderboards, rate limiting).
5. **Payments (Stripe) + notifications** (premium modes, review reminders).

### Guardrails
- Offline-first; account optional.
- **Grounding:** generate/grade only from user-provided source; cite it; never invent case citations or facts (critical for law/medicine).
- **Never store PHI** (medicine); keep sensitive-subject content local-only until compliant.
- Rate-limit the LLM proxy per user; JWT expiry + refresh.
- Encrypt secrets via env vars; least data stored.

---

## Part 2 — The build prompt (hand this to a coding agent)

> **Copy everything below this line into a fresh coding session.**

---

You are building the backend for **Mafsar**, an existing browser extension (Chrome + Firefox, MV3) that captures a user's AI-chat learning sessions (ChatGPT/Claude/Gemini) and turns them into flashcards, quizzes, and spaced-repetition reviews. The extension currently stores everything locally in `chrome.storage.local`. Your job is to add a **lightweight backend** in a new `server/` folder of the same repo, enabling accounts, cross-device sync, server-side AI generation, and analytics — **without breaking the fully-offline, no-account experience.**

### Existing client data shapes (match these)
- **set**: `{ id, title, source, sourceLabel, mode, examDate?, createdAt, updatedAt }`
- **card**: `{ id, setId, front, back, easiness, interval, repetitions, dueDate, updatedAt }` (SM-2 fields)
- **quiz question**: `{ id, setId, q, options: string[], answer: number, explain }`
- **activity**: `{ day: "YYYY-MM-DD", count }` (used for streaks)

### Tech constraints (use exactly these — keep it lightweight)
- TypeScript + Node, framework **Hono** (`@hono/node-server`)
- **`better-sqlite3`** for the DB, written so it can swap to **libSQL/Turso** for hosting
- **zod** for validation, **jose** for JWT, **bcryptjs** for password hashing
- No heavyweight ORM — use small hand-written SQL with a thin query helper and a migrations file
- ~5 runtime dependencies max; must run locally with `npm run dev`

### Build Phase 1 now (auth + sync); stub later phases behind clear TODOs
1. **Project scaffold** in `server/`: `package.json`, `tsconfig.json`, `.env.example` (`JWT_SECRET`, `DATABASE_URL`, `LLM_PROVIDER`, `LLM_API_KEY`), `src/index.ts`, `src/db.ts` (connection + schema/migrations), `src/auth.ts`, `src/routes/*`, `src/schema.ts`.
2. **Database**: create tables `users, sets, cards, quiz, activity, review_log` per the data model above; every syncable row has `updated_at` and a `deleted` tombstone flag.
3. **Auth**: `POST /v1/auth/register` and `/login` (bcrypt hash, return a signed JWT), `GET /v1/me`. JWT middleware protects all `/v1/*` except auth. Access token + refresh token.
4. **Sync (offline-first)**: `POST /v1/sync` accepting `{ since: ISOstring, sets[], cards[], quiz[], activity[], reviews[] }`. Apply client changes with **last-write-wins by `updated_at`**, honor tombstones, then return all server-side rows changed since `since` plus `serverTime`. This is the heart of multi-device sync — make it idempotent and correct.
5. **Tests + docs**: a few `vitest`/node tests for auth + sync conflict resolution, and a `server/README.md` with `curl` examples and run/deploy steps (Fly.io or Render).

### Later phases — scaffold the routes and TODO the bodies
- **Phase 2 — LLM proxy (mode-aware):**
  - `POST /v1/generate { mode, transcript|sourceText }` → `{ flashcards, quiz, summary }`
  - `POST /v1/grade { mode, question, rubric|rule, answer }` → `{ score, correct, feedback }` (AI short-answer / IRAC grading)
  - `POST /v1/hypothetical { mode, rule|concept }` → `{ scenario, rubric }` (fresh fact-pattern for adaptive practice)
  - `mode ∈ { general, coding, law, medicine }` selects a prompt template. **Ground strictly in the provided source; never fabricate citations.** Rate-limit per user.
- **Phase 3 — Analytics:** `GET /v1/insights` → weak topics, exam-readiness (using `sets.examDate`), and a v1 personalized forgetting prediction computed from `review_log`.
- **Phase 4 — Teams + Redis:** `teams`, `team_members`, `shared_sets`; Upstash Redis for streak leaderboards (sorted sets) and rate limiting.
- **Phase 5 — Payments + notifications:** Stripe subscriptions gating premium modes; scheduled review reminders.

### Non-negotiable requirements
- The extension must keep working **fully offline with no account**; login only *adds* sync.
- **Grounding & safety:** generation/grading use only user-supplied content; cite sources; never invent legal citations or medical facts; **never persist PHI**.
- Keep dependencies minimal and the code readable (plain SQL, small modules).
- Provide `.env.example`, migrations, and `curl` examples so it runs end-to-end locally.

Deliver Phase 1 fully working (register → login → sync round-trips via `curl`), with Phases 2–5 scaffolded as documented stubs.

---
