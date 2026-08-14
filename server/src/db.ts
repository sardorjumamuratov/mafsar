import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

export type DB = Database.Database;

// To move to Turso/libSQL for hosting: replace this factory with
// @libsql/client, keep the same SQL statements, and swap ? placeholders (1,2,3)
// for libSQL's named-parameter style. Everything else is plain SQL.
export function openDB(path: string): DB {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

// --- migrations -------------------------------------------------------------
// Ordered list of DDL batches; `migrations` table tracks applied ones.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

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

  CREATE TABLE activity (
    user_id TEXT NOT NULL REFERENCES users(id),
    day TEXT NOT NULL,               -- 'YYYY-MM-DD'
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day)
  );

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

export function migrate(db: DB): void {
  db.exec(`CREATE TABLE IF NOT EXISTS migrations (
    name TEXT PRIMARY KEY, applied_at TEXT NOT NULL
  )`);
  const applied = new Set(
    (db.prepare("SELECT name FROM migrations").all() as { name: string }[]).map(
      (r) => r.name,
    ),
  );
  MIGRATIONS.forEach((sql, i) => {
    const name = `00${i + 1}_init`;
    if (applied.has(name)) return;
    db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO migrations (name, applied_at) VALUES (?, ?)").run(
        name,
        new Date().toISOString(),
      );
    })();
  });
}

// --- thin query helpers ------------------------------------------------------
export const uid = () => randomUUID();
export const nowISO = () => new Date().toISOString();
