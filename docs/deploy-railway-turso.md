# Deploying Mafsar backend → Railway + Turso

A step-by-step guide to host the `server/` (Hono) backend on **Railway** with the database on **Turso** (hosted libSQL/SQLite).

> **One required code change first:** the current `server/` uses `better-sqlite3` (a local file, synchronous). Turso is accessed over the network via `@libsql/client` (asynchronous). So Part 2 swaps the DB layer. If you'd rather **not** change code yet, jump to *Appendix: Railway + volume (no Turso)* — it deploys the current code as-is with a persistent disk.

---

## Architecture
```
Extension ──HTTPS──▶ Railway (Hono server, stateless) ──libSQL──▶ Turso (database)
```
The server stays stateless (no local DB file), so redeploys can't lose data.

---

## Prerequisites
- The repo on GitHub (already: `github.com/sardorjumamuratov/mafsar`).
- A **Railway** account (railway.app) and a **Turso** account (turso.tech).
- Node 18+ locally.
- Turso CLI. On macOS/Linux: `curl -sSfL https://get.tur.so/install.sh | bash`. **On Windows, use WSL** (or do the DB steps from the Turso web dashboard).

---

## Part 1 — Create the Turso database
```bash
turso auth signup            # or: turso auth login
turso db create mafsar       # creates the database

turso db show mafsar --url   # -> libsql://mafsar-<org>.turso.io   (TURSO_DATABASE_URL)
turso db tokens create mafsar # -> a long token                    (TURSO_AUTH_TOKEN)
```
Copy the **URL** and **token** — you'll paste them into Railway env vars later. Free tier is plenty for launch.

---

## Part 2 — Switch the DB layer to libSQL (`@libsql/client`)

**2a. Add the dependency and drop the native one:**
```bash
cd server
npm install @libsql/client
npm uninstall better-sqlite3 @types/better-sqlite3
```

**2b. Also make the runtime deps production-safe.** `tsx` currently runs the server; move it (and `typescript`) into `dependencies` so `npm start` works on Railway:
```bash
npm install tsx typescript
```

**2c. Rewrite `src/db.ts`** to use libSQL. Same SQL, but calls become **async** and use `execute({ sql, args })`. Local dev can still use a file via `url: "file:mafsar.db"`.

```ts
import { createClient, type Client } from "@libsql/client";
import { randomUUID } from "node:crypto";

export type DB = Client;

export function openDB(): DB {
  return createClient({
    url: process.env.TURSO_DATABASE_URL ?? "file:mafsar.db", // file: for local dev
    authToken: process.env.TURSO_AUTH_TOKEN,                 // undefined for file:
  });
}

const MIGRATIONS: string[] = [ /* keep the same DDL string from the old db.ts */ ];

export async function migrate(db: DB): Promise<void> {
  await db.execute(
    `CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`
  );
  const res = await db.execute("SELECT name FROM migrations");
  const applied = new Set(res.rows.map((r) => r.name as string));
  for (let i = 0; i < MIGRATIONS.length; i++) {
    const name = `00${i + 1}_init`;
    if (applied.has(name)) continue;
    // libSQL runs statements one at a time — split the DDL batch on ';'
    const stmts = MIGRATIONS[i].split(";").map((s) => s.trim()).filter(Boolean);
    await db.batch([...stmts, {
      sql: "INSERT INTO migrations (name, applied_at) VALUES (?, ?)",
      args: [name, new Date().toISOString()],
    }], "write");
  }
}

export const uid = () => randomUUID();
export const nowISO = () => new Date().toISOString();
```

**2d. Make callers async.** Every `db.prepare(...).get/all/run(...)` becomes `await db.execute({ sql, args: [...] })`, and rows come back on `.rows`. This touches `src/auth.ts`, `src/sync.ts`, and `src/index.ts` (which now `await openDB()` + `await migrate(db)`). Keep the same SQL text; only the call style changes.

**2e. Update `src/index.ts`** so migrations run on boot (no separate step needed):
```ts
const db = openDB();
await migrate(db);
const app = createApp(db);
const port = Number(process.env.PORT ?? 8787); // Railway injects PORT
serve({ fetch: app.fetch, port });
```

**2f. Add CORS** (so the extension/web app can call it) — in `src/app.ts`:
```ts
import { cors } from "hono/cors";
app.use("*", cors());
```

**2g. Test locally against a file, then against Turso:**
```bash
npm run dev                      # uses file:mafsar.db
# then point at Turso:
TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npm start
```

> Want me to do 2c–2f for you? It's a mechanical async refactor — say the word.

---

## Part 3 — Deploy the server to Railway
1. **railway.app → New Project → Deploy from GitHub repo →** select `mafsar`.
2. Open the service → **Settings → Root Directory → `server`** (the backend is in a subfolder — this is essential).
3. Railway auto-detects Node. Confirm:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
4. **Variables** (Settings → Variables) — add:
   ```
   TURSO_DATABASE_URL = libsql://mafsar-<org>.turso.io
   TURSO_AUTH_TOKEN   = <token from Part 1>
   JWT_SECRET         = <run: openssl rand -hex 32>
   LLM_PROVIDER       = gemini
   LLM_API_KEY        = <your provider key>   # for the Phase-2 LLM proxy
   ```
   Do **not** set `PORT` — Railway injects it automatically, and the code already reads `process.env.PORT`.
5. **Deploy.** Then **Settings → Networking → Generate Domain** to get a public URL like `https://mafsar-production.up.railway.app`.
6. On first boot, `migrate()` creates the tables in Turso automatically.

---

## Part 4 — Verify it works
```bash
BASE=https://mafsar-production.up.railway.app

# register
curl -s -X POST $BASE/v1/auth/register -H 'content-type: application/json' \
  -d '{"email":"you@test.com","password":"secret123"}'

# login -> copy the token
curl -s -X POST $BASE/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"you@test.com","password":"secret123"}'

# authed call
curl -s $BASE/v1/me -H "authorization: Bearer <TOKEN>"
```
Check data landed: `turso db shell mafsar "SELECT email FROM users;"`

---

## Part 5 — Point the extension at the backend
1. Add the base URL as a config constant in the extension (e.g., `src/config.js` → `export const API_BASE = "https://mafsar-production.up.railway.app"`).
2. Add it to `manifest.json` **`host_permissions`**: `"https://mafsar-production.up.railway.app/*"`.
3. The extension's sync/auth calls target `API_BASE`; keep `chrome.storage` as the offline cache (login stays optional).

---

## Secrets, cost, and gotchas
- **Secrets:** only in Railway Variables / local `.env` (gitignored) — never commit them.
- **Cost:** Railway hobby ≈ **$5/mo** usage-based; Turso free tier covers early users. ~$5/mo until traction.
- **Gotchas:**
  - Root Directory **must** be `server`.
  - `tsx` must be a **dependency** (not devDependency) for `npm start` in production.
  - Never hardcode the port — use `process.env.PORT`.
  - Add **CORS** or browser/web callers get blocked.
  - Rotate the Turso token if it ever leaks (`turso db tokens create` + update Railway).

---

## Appendix — Railway + volume (no Turso, no code change)
If you want to deploy the **current** `better-sqlite3` code unchanged:
1. Railway → deploy repo, Root Directory `server`, start `npm start`.
2. **Add a Volume** (service → **Variables/Volumes → New Volume**) mounted at e.g. `/data`.
3. Set env `DATABASE_PATH=/data/mafsar.sqlite` (the code already reads `DATABASE_PATH`).
4. Deploy. The SQLite file now persists across redeploys on the volume.
- Trade-off: single instance only (no horizontal scaling), and you manage backups of the volume. Fine for launch; Turso is the cleaner long-term path.
