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

## Deploy

### Railway (recommended first stop)

The service uses better-sqlite3 with a file DB, so it needs a **volume** — data on the container filesystem is lost on every deploy.

1. Push the repo to GitHub, then at [railway.app](https://railway.app): **New Project → Deploy from GitHub repo**.
2. **Settings → Root Directory**: `server` (Railway will pick up `server/railway.json`; it runs `npm ci && npm start` and health-checks `/healthz`).
3. **Storage → Add Volume**, mount path `/data`.
4. **Variables** — add:
   - `JWT_SECRET` = output of `openssl rand -hex 32` (required in production; the dev fallback refuses to run without warning otherwise)
   - `DATABASE_PATH` = `/data/mafsar.sqlite` (on the volume — this is what makes data survive deploys)
   - `NODE_ENV` = `production`
   - `PORT` — leave unset; Railway injects it.
5. Deploy, then **Settings → Networking → Generate Domain** for a public URL (e.g. `https://mafsar.up.railway.app`). You can attach a custom domain later, which you'll want before payments.

Verify from anywhere:

```bash
curl https://<your-app>.up.railway.app/healthz
# {"ok":true}
```

Notes:
- Migrations run automatically on boot (`openDB` → `migrate`).
- Cost on the Hobby plan: ~$5/mo including usage; the tiny service + 1GB volume fits inside the included credit.
- The volume is single-region — pick the region closest to your users. When you outgrow that, migrate the DB to Turso (below) and the host becomes swappable.

### Later: Turso/libSQL (for scale or global deploys)

Swap `openDB` in `src/db.ts` to `@libsql/client` pointing at Turso (`DATABASE_URL` + `TURSO_AUTH_TOKEN`), then any host works — including free/spin-down ones like Render, since data no longer lives on the compute host:

```bash
fly launch --no-deploy
fly secrets set JWT_SECRET=$(openssl rand -hex 32)
fly deploy
```

## Roadmap (stubbed, returns 501)

- **Phase 2** — LLM proxy: `/v1/generate`, `/v1/grade`, `/v1/hypothetical` (mode-aware, grounded in user source, rate-limited).
- **Phase 3** — `/v1/insights`: weak topics, exam readiness, forgetting model from `review_log`.
- **Phase 4** — Teams + Redis: shared sets, streak leaderboards, rate limiting.
- **Phase 5** — Stripe payments, review reminders.
