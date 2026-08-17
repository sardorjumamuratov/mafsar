# mafsar-server

Lightweight backend for the Mafsar extension: accounts, offline-first cross-device sync, and (later) server-side AI generation and analytics. Hono + better-sqlite3 + zod + jose — written so the DB can swap to libSQL/Turso for hosting.

The extension keeps working fully offline with no account; login only adds sync.

## Run locally

```bash
cd server
npm install
cp .env.example .env   # defaults are fine for dev
npm run dev            # http://localhost:8787
```

Migrations run automatically on startup (also available standalone: `npm run migrate`).

## Auth

JWT access token (15 min) + refresh token (30 days). All `/v1/*` routes except `/v1/auth/*` require `Authorization: Bearer <accessToken>`.

```bash
# Register
curl -s -X POST localhost:8787/v1/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"password123"}'
# -> { "accessToken": "...", "refreshToken": "...", "user": {...} }

# Login
curl -s -X POST localhost:8787/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"password123"}'

# Refresh
curl -s -X POST localhost:8787/v1/auth/refresh \
  -H 'content-type: application/json' -d '{"refreshToken":"..."}'

# Me
curl -s localhost:8787/v1/me -H 'authorization: Bearer <accessToken>'
```

## Sync — POST /v1/sync

Send local mutations, get back everything that changed on the server since your last sync. Field names match the extension's chrome.storage shapes (camelCase).

```bash
curl -s -X POST localhost:8787/v1/sync \
  -H 'authorization: Bearer <accessToken>' \
  -H 'content-type: application/json' \
  -d '{
    "since": "2026-08-01T00:00:00.000Z",
    "sets":    [{ "id":"s1","title":"Torts","mode":"law","createdAt":"2026-08-14T10:00:00Z","updatedAt":"2026-08-14T10:00:00Z" }],
    "cards":   [{ "id":"c1","setId":"s1","front":"Rule?","back":"...","easiness":2.5,"interval":0,"repetitions":0,"dueDate":null,"updatedAt":"2026-08-14T10:00:00Z" }],
    "quiz":    [{ "id":"q1","setId":"s1","q":"...","options":["a","b"],"answer":0,"explain":null,"updatedAt":"2026-08-14T10:00:00Z" }],
    "activity":[{ "day":"2026-08-14","count":5 }],
    "reviews": [{ "id":"r1","cardId":"c1","grade":4,"prevInterval":0,"newInterval":1,"reviewedAt":"2026-08-14T10:05:00Z" }]
  }'
# -> { "serverTime": "...", "sets": [...], "cards": [...], "quiz": [...], "activity": [...], "reviews": [...] }
```

Semantics:
- **Last-write-wins** by `updatedAt` (ISO string comparison). Stale writes are ignored.
- **Tombstones**: send `"deleted": true` on a set/card/quiz. Tombstones are returned to other devices until they acknowledge.
- **Activity** is max-merged per day (reviewing on two devices keeps the larger count).
- **Reviews** are append-only and idempotent by id — they seed the future forgetting model.
- The endpoint is idempotent: replaying a batch is a no-op.

First sync: omit `since` to receive all data. Subsequently pass the `serverTime` from the previous response.

## Phase 2 — LLM proxy (live)

The extension no longer holds an API key; generation and grading run server-side with the `LLM_PROVIDER` + `LLM_API_KEY` env vars (Gemini / Groq / Anthropic, optional `LLM_MODEL`). All routes require a Bearer token:

- `POST /v1/generate` `{ messages: [{role, text}] }` → `{ flashcards: [{id, front, back}], quiz: [{id, q, options, answer, explain}] }`
- `POST /v1/grade` `{ question, reference, answer }` → `{ score, correct, feedback }`
- `POST /v1/hypothetical` `{ concept, reference }` → `{ scenario, rubric }`
- `POST /v1/summarize` `{ messages }` → `{ summary, keyPoints }`

Grounding rules are enforced in the prompts: judge/generate only from user-supplied content; never fabricate citations or facts.

## Deploy (Railway + Turso)

The server is stateless: it talks to Turso (hosted libSQL) over the network, so redeploys can't lose data and no volume is needed. Local dev falls back to a file (`file:mafsar.db`) automatically.

### 1. Create the Turso database

```bash
turso auth signup              # or: turso auth login
turso db create mafsar
turso db show mafsar --url     # -> libsql://mafsar-<org>.turso.io  (TURSO_DATABASE_URL)
turso db tokens create mafsar  # -> long token                     (TURSO_AUTH_TOKEN)
```

(Windows: run these in WSL, or create the DB + token from the Turso web dashboard.)

### 2. Deploy the server

1. [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo** → `sardorjumamuratov/mafsar`.
2. **Settings → Root Directory**: `server` (essential — the backend is in a subfolder). Railway picks up `server/railway.json` (`npm ci` + `npm start`, healthcheck `/healthz`).
3. **Variables**:
   - `TURSO_DATABASE_URL` = your libsql URL
   - `TURSO_AUTH_TOKEN` = your token
   - `JWT_SECRET` = output of `openssl rand -hex 32`
   - `NODE_ENV` = `production`
   - Don't set `PORT` — Railway injects it.
4. Deploy → **Settings → Networking → Generate Domain**. Tables are created automatically on first boot.

### 3. Verify

```bash
BASE=https://<your-app>.up.railway.app
curl -s $BASE/healthz          # {"ok":true}
curl -s -X POST $BASE/v1/auth/register -H 'content-type: application/json' \
  -d '{"email":"you@test.com","password":"secret123"}'
# check data landed:
turso db shell mafsar "SELECT email FROM users;"
```

### Cost & gotchas

- Railway Hobby ≈ $5/mo (includes $5 usage); Turso free tier covers launch.
- Secrets live only in Railway Variables / local `.env` (gitignored) — never commit them.
- Rotate the Turso token if it ever leaks: `turso db tokens create mafsar` + update the Railway variable.
- Later: point the extension at the API base URL (config constant + `host_permissions` entry in `manifest.json`). chrome.storage stays the offline cache; login stays optional.
