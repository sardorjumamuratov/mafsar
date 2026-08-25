# Build prompt — connect the Mafsar extension to the backend (auth + sync)

Hand the section below to a coding agent (GLM). It's grounded in the extension's
real storage shapes and the deployed server's exact `/v1/sync` contract.

> **Before running:** replace `__RAILWAY_URL__` everywhere with your real Railway
> URL, e.g. `https://mafsar-production.up.railway.app` (no trailing slash).

---

You are extending the **Mafsar** browser extension (MV3, Chrome + Firefox, vanilla
JS ES modules, no build step) to sync with its deployed backend. The extension must
stay **fully functional offline with no account** — signing in only *adds* cloud
sync. Match the existing code style, the teal design system in `panel.css`, the
cross-browser `chrome.*` **callback** style already used in `panel.js`, and the
`esc()` helper for any user text put into HTML.

## The backend (already deployed)
Base URL: `__RAILWAY_URL__`

- `POST /v1/auth/register` `{email, password}` → `{accessToken, refreshToken, user:{id,email}}`
- `POST /v1/auth/login` `{email, password}` → same
- `POST /v1/auth/refresh` `{refreshToken}` → `{accessToken}`
- `GET  /v1/me` (Bearer accessToken) → `{user, usage: {used, limit}}` (`limit` is `null` on Pro)
- `POST /v1/sync` (Bearer accessToken) — offline-first, last-write-wins by `updatedAt`:
  - **request** `{ since?, sets[], cards[], quiz[], activity[], reviews[] }`
  - **response** `{ serverTime, sets[], cards[], quiz[], activity[], reviews[] }`

### Server record shapes (camelCase in/out; strings for all timestamps, ISO-8601)
- **set**: `{ id, title, source?, sourceLabel?, mode, examDate?, createdAt, updatedAt, deleted? }`
- **card**: `{ id, setId, front, back, easiness, interval, repetitions, dueDate?, updatedAt, deleted? }`
- **quiz**: `{ id, setId, q, options[], answer, explain?, updatedAt, deleted? }`
- **activity**: `{ day: "YYYY-MM-DD", count }`
- **review**: `{ id, cardId, grade(0-5), prevInterval, newInterval, reviewedAt }`

## The extension's CURRENT local model (in `src/storage/store.js`)
- `sessions`: `[{ id, source, sourceLabel, title, url, capturedAt(ms), messages, importedCount? }]`
- `studySets`: `[{ id, sessionId, title, createdAt(ms), mode?, examDate?(ms), flashcards:[{id,front,back,easiness,interval,repetitions,dueDate(ms)}], quiz:[{id,q,options,answer,explain}] }]`
- `activity`: a **map** `{ "YYYY-MM-DD": count }`
- `settings`: `{ provider, apiKey, model }`
- Deletes are **hard deletes**; there is **no `updatedAt`**, **no tombstones**, and **no review log** yet.

## Work to do

### 1. Config + permissions
- Add `src/config.js` exporting `export const API_BASE = "__RAILWAY_URL__";`
- Add `"__RAILWAY_URL__/*"` to `host_permissions` in `manifest.json`.

### 2. Make local storage sync-ready (in `store.js`)
- **Stamp `updatedAt` (ISO string)** on every write to a studySet and to a card:
  in `saveStudySet`, `updateCard`, `setExamDate`, the import path, and generation.
  Add a helper `nowISO = () => new Date().toISOString()`.
- **Tombstones instead of hard delete:** change `deleteSession` to mark the studySet
  `deleted:true` + fresh `updatedAt` (and keep it) rather than removing it; filter
  `deleted` sets/cards out of all UI queries. (Cards deleted individually get the same treatment.)
- **Review log:** add a `reviewLog` array in storage; append `{ id:uid(), cardId, grade, prevInterval, newInterval, reviewedAt:nowISO() }` on every grade (wire into the panel's `gradeCard`). Cap to the last ~2000.
- **Sync bookkeeping:** store `auth = { accessToken, refreshToken, user, lastSync }` in `chrome.storage.local`.

### 3. Mapping layer (local ↔ server) — `src/sync/map.js`
A server **set** = one local **studySet joined with its session** (`session.id === studySet.sessionId`). Use **`session.id` as the server `set.id`** and as each card/quiz `setId`.

**Local → server (push)**, for each studySet `st` + its session `se`:
```
set  = { id: se.id, title: st.title ?? se.title, source: se.source ?? null,
         sourceLabel: se.sourceLabel ?? null, mode: st.mode ?? "general",
         examDate: st.examDate ? new Date(st.examDate).toISOString() : null,
         createdAt: new Date(st.createdAt ?? se.capturedAt ?? Date.now()).toISOString(),
         updatedAt: st.updatedAt, deleted: !!st.deleted }
cards = st.flashcards.map(c => ({ id:c.id, setId:se.id, front:c.front, back:c.back,
         easiness:c.easiness ?? 2.5, interval:c.interval ?? 0, repetitions:c.repetitions ?? 0,
         dueDate: c.dueDate ? new Date(c.dueDate).toISOString() : null,
         updatedAt: c.updatedAt, deleted: !!c.deleted }))
quiz  = st.quiz.map(q => ({ id:q.id, setId:se.id, q:q.q, options:q.options,
         answer:q.answer, explain:q.explain ?? null, updatedAt: q.updatedAt ?? st.updatedAt, deleted:false }))
activity = Object.entries(activityMap).map(([day,count]) => ({ day, count }))
reviews  = reviewLog (already server-shaped)
```
Only include sets/cards/quiz/reviews whose `updatedAt`/`reviewedAt` `>` `auth.lastSync` (send everything if `lastSync` is empty). **Timestamps to the server are ISO strings; `dueDate` converts ms→ISO.**

**Server → local (apply response)** — reverse it, honoring last-write-wins by `updatedAt` and tombstones:
- For each server `set`: upsert a local `session` `{ id:set.id, source:set.source, sourceLabel:set.sourceLabel, title:set.title, capturedAt: Date.parse(set.createdAt), messages: existing ?? [] }` and a local `studySet` `{ sessionId:set.id, id: existing?.id ?? uid(), title:set.title, mode:set.mode, examDate: set.examDate ? Date.parse(set.examDate) : undefined, createdAt: Date.parse(set.createdAt), updatedAt:set.updatedAt, deleted:set.deleted, flashcards: existing ?? [], quiz: existing ?? [] }` — **only if `set.updatedAt > local.updatedAt`**.
- For each server `card`: find the studySet with `sessionId === card.setId`, upsert into its `flashcards` by `id` with LWW; convert `dueDate` ISO→ms (`Date.parse`); drop/tombstone if `deleted`.
- For each server `quiz`: upsert into that studySet's `quiz` by `id` with LWW.
- **activity:** merge into the map with `Math.max(existing, count)`.
- **reviews:** merge into `reviewLog` by `id`.
- Save `auth.lastSync = response.serverTime`.

### 4. Auth client — `src/sync/auth.js`
- `register/login`: POST, store `{accessToken, refreshToken, user}` in `auth`; `logout`: clear tokens (keep local study data).
- `authedFetch(path, opts)`: adds `Authorization: Bearer <accessToken>`; on **401**, call `/v1/auth/refresh` with the refresh token once, store the new access token, retry; if refresh fails, `logout()` and surface "signed out".
- Use `fetch` (available in MV3 service worker and panel).

### 5. Sync client — `src/sync/sync.js`
- `syncNow()`: build the push payload (section 3) with `since = auth.lastSync`, `POST /v1/sync` via `authedFetch`, apply the response (section 3), save `lastSync`. No-op (return early) if not signed in. Guard against concurrent runs.
- Trigger `syncNow()`: on panel open (if signed in), after a capture/generation, and after a review session. Fail silently offline (keep local data).

### 6. UI — the "You" tab (`renderYou` in `panel.js`)
- Signed out: email + password fields, **Sign in** / **Create account** buttons, and a note that study works offline without an account.
- Signed in: show the email, a **Sync now** button (calls `syncNow`, shows last-synced time), and **Sign out**.
- Show a small toast on sync success/failure.

## Requirements
- **Offline-first**: logged-out and offline both work; login only adds sync.
- Cross-browser (`chrome.*` callback style; `fetch` for network). No build step, no new deps.
- Don't break existing local features (review, import, exam date, streaks).
- Add tests for the pure mapping functions (local↔server round-trip, LWW pick, tombstone) using the repo's `node --input-type=module` pattern.

## Acceptance criteria
- Create an account in the panel → capture/generate a set → **Sync now** → the set appears in Turso (verify via a second browser profile signing into the same account and syncing down).
- Edit/grade on one profile, sync; the other profile syncs and sees the change (last-write-wins).
- Delete a set on one profile → after sync it's gone on the other (tombstone).
- With no account (or offline), everything still works locally.

Build sections 1–5 first (make sync provable via console/`syncNow()`), then the "You" tab UI (6).
