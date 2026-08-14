import { createClient, type Client } from "@libsql/client";
import { randomUUID } from "node:crypto";

// libSQL client — talks to Turso in production (TURSO_DATABASE_URL) or a local
// file in dev. The server stays stateless: no DB file on the container, so
// redeploys can't lose data.
export type DB = Client;

export function openDB(url?: string): DB {
  return createClient({
    url: url ?? process.env.TURSO_DATABASE_URL ?? "file:mafsar.db",
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
}

// --- thin async query helpers ------------------------------------------------
export async function one<T = any>(db: DB, sql: string, args: unknown[] = []): Promise<T | undefined> {
  const res = await db.execute({ sql, args: args as any[] });
  return res.rows[0] as T | undefined;
}
export async function all<T = any>(db: DB, sql: string, args: unknown[] = []): Promise<T[]> {
  const res = await db.execute({ sql, args: args as any[] });
  return res.rows as T[];
}
export async function run(db: DB, sql: string, args: unknown[] = []): Promise<number> {
  const res = await db.execute({ sql, args: args as any[] });
  return Number(res.rowsAffected ?? 0);
}

// --- migrations ---------------------------------------------------------------
// Ordered list of DDL batches; the `migrations` table tracks applied ones.
// Each batch is split on ';' because libSQL executes one statement at a time.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_users_email ON users(email);
  `,
  `
  CREATE TABLE sets (
    id TEXT PRIMARY KEY,             -- client-generated UUID, matches extension
    user_id TEXT NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    source TEXT,
    source_label TEXT,
    mode TEXT NOT NULL DEFAULT 'general',
    exam_date TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_sets_user_updated ON sets(user_id, updated_at);
  `,
  `
  CREATE TABLE cards (
    id TEXT PRIMARY KEY,
    set_id TEXT NOT NULL REFERENCES sets(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    front TEXT NOT NULL,
    back TEXT NOT NULL,
    easiness REAL NOT NULL DEFAULT 2.5,
    interval REAL NOT NULL DEFAULT 0,
    repetitions INTEGER NOT NULL DEFAULT 0,
    due_date TEXT,
    updated_at TEXT NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_cards_user_updated ON cards(user_id, updated_at);
  `,
  `
  CREATE TABLE quiz (
    id TEXT PRIMARY KEY,
    set_id TEXT NOT NULL REFERENCES sets(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    question TEXT NOT NULL,
    options_json TEXT NOT NULL,
    answer INTEGER NOT NULL,
    explain TEXT,
    updated_at TEXT NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_quiz_user_updated ON quiz(user_id, updated_at);
  `,
  `
  CREATE TABLE activity (
    user_id TEXT NOT NULL REFERENCES users(id),
    day TEXT NOT NULL,               -- 'YYYY-MM-DD'
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day)
  );
  `,
  `
  CREATE TABLE review_log (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    card_id TEXT NOT NULL,
    grade INTEGER NOT NULL,
    prev_interval REAL NOT NULL DEFAULT 0,
    new_interval REAL NOT NULL DEFAULT 0,
    reviewed_at TEXT NOT NULL
  );
  CREATE INDEX idx_review_log_user ON review_log(user_id, reviewed_at);
  `,
];

export async function migrate(db: DB): Promise<void> {
  await db.execute(
    "CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)"
  );
  const res = await db.execute("SELECT name FROM migrations");
  const applied = new Set(res.rows.map((r) => r.name as string));
  for (let i = 0; i < MIGRATIONS.length; i++) {
    const name = `00${i + 1}`;
    if (applied.has(name)) continue;
    const stmts = MIGRATIONS[i].split(";").map((s) => s.trim()).filter(Boolean);
    await db.batch(
      [
        ...stmts.map((sql) => ({ sql })),
        { sql: "INSERT INTO migrations (name, applied_at) VALUES (?, ?)", args: [name, new Date().toISOString()] },
      ],
      "write"
    );
  }
}

export const uid = () => randomUUID();
export const nowISO = () => new Date().toISOString();
