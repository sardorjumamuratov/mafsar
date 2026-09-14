import * as SQLite from 'expo-sqlite';

export async function initDB() {
  const db = await SQLite.openDatabaseAsync('mafsar.db');
  
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    
    CREATE TABLE IF NOT EXISTS sets (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source TEXT,
      source_label TEXT,
      mode TEXT,
      exam_date INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      dirty INTEGER NOT NULL DEFAULT 0
    );
    
    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      set_id TEXT NOT NULL,
      front TEXT NOT NULL,
      back TEXT NOT NULL,
      easiness REAL NOT NULL DEFAULT 2.5,
      interval REAL NOT NULL DEFAULT 0,
      repetitions INTEGER NOT NULL DEFAULT 0,
      due_date INTEGER,
      updated_at TEXT NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      dirty INTEGER NOT NULL DEFAULT 0,
      stability REAL,
      difficulty REAL,
      state TEXT,
      lapses INTEGER NOT NULL DEFAULT 0,
      last_review TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_cards_set_id ON cards(set_id);
    CREATE INDEX IF NOT EXISTS idx_cards_due_date ON cards(due_date) WHERE deleted = 0;
    
    CREATE TABLE IF NOT EXISTS quiz (
      id TEXT PRIMARY KEY,
      set_id TEXT NOT NULL,
      question TEXT NOT NULL,
      options_json TEXT NOT NULL,
      answer INTEGER NOT NULL,
      explain TEXT,
      updated_at TEXT NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      dirty INTEGER NOT NULL DEFAULT 0
    );
    
    CREATE TABLE IF NOT EXISTS activity (
      day TEXT PRIMARY KEY,
      count INTEGER NOT NULL,
      dirty INTEGER NOT NULL DEFAULT 0
    );
    
    CREATE TABLE IF NOT EXISTS review_log (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL,
      grade INTEGER NOT NULL,
      prev_interval REAL NOT NULL,
      new_interval REAL NOT NULL,
      reviewed_at TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'flashcard',
      stability REAL,
      difficulty REAL,
      dirty INTEGER NOT NULL DEFAULT 0
    );
  `);
  
  return db;
}

export const getDB = () => SQLite.openDatabaseAsync('mafsar.db');

export async function getMeta(key: string): Promise<string | null> {
  const db = await getDB();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key]);
  return row ? row.value : null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  const db = await getDB();
  await db.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [key, value]);
}
