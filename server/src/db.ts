import { createClient, type Client } from "@libsql/client";
import { randomUUID } from "node:crypto";

// libSQL client — talks to Turso in production (TURSO_DATABASE_URL) or a local
// file in dev. The server stays stateless: no DB file on the container, so
// redeploys can't lose data.
import type { Transaction } from "@libsql/client";
export type DB = Client;

export function openDB(url?: string): DB {
  return createClient({
    url: url ?? process.env.TURSO_DATABASE_URL ?? "file:mafsar.db",
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
}

// --- thin async query helpers ------------------------------------------------
export async function one<T = any>(db: DB | Transaction, sql: string, args: unknown[] = []): Promise<T | undefined> {
  const res = await db.execute({ sql, args: args as any[] });
  return res.rows[0] as T | undefined;
}
export async function all<T = any>(db: DB | Transaction, sql: string, args: unknown[] = []): Promise<T[]> {
  const res = await db.execute({ sql, args: args as any[] });
  return res.rows as T[];
}
export async function run(db: DB | Transaction, sql: string, args: unknown[] = []): Promise<number> {
  const res = await db.execute({ sql, args: args as any[] });
  return Number(res.rowsAffected ?? 0);
}

// --- migrations ---------------------------------------------------------------
// Ordered list of DDL batches; the `migrations` table tracks applied ones.
//
// A migration is identified by its POSITION here (`00${i + 1}`), so this list is
// append-only in the strictest sense: inserting one in the middle renames every
// entry after it, which makes an applied migration look unapplied and re-runs it
// against a database that already has it. Add new ones at the END, never
// anywhere else, and never edit or reorder an existing entry.
// server/tests/migrations.test.ts fails the build if you do.
// Each batch is split on ';' because libSQL executes one statement at a time.
export const MIGRATIONS: string[] = [
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
  `
  CREATE TABLE shares (
    code       TEXT PRIMARY KEY,
    set_id     TEXT NOT NULL REFERENCES sets(id),
    user_id    TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    revoked    INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_shares_set ON shares(set_id, user_id, revoked);
  `,
  `
  CREATE TABLE teams (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    code       TEXT NOT NULL UNIQUE,
    owner_id   TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_teams_code ON teams(code);
  CREATE TABLE team_members (
    team_id    TEXT NOT NULL REFERENCES teams(id),
    user_id    TEXT NOT NULL REFERENCES users(id),
    joined_at  TEXT NOT NULL,
    PRIMARY KEY (team_id, user_id)
  );
  CREATE INDEX idx_team_members_user ON team_members(user_id);
  `,
  `
  ALTER TABLE users ADD COLUMN google_sub TEXT;
  ALTER TABLE users ADD COLUMN name TEXT;
  CREATE UNIQUE INDEX idx_users_google_sub ON users(google_sub);
  CREATE TABLE pending_logins (
    id            TEXT PRIMARY KEY,
    poll_hash     TEXT NOT NULL,
    code_verifier TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending',
    user_id       TEXT,
    access_token  TEXT,
    refresh_token TEXT,
    email         TEXT,
    error         TEXT,
    created_at    TEXT NOT NULL,
    expires_at    TEXT NOT NULL
  );
  CREATE INDEX idx_pending_logins_expires ON pending_logins(expires_at);
  `,
  `
  ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free';
  ALTER TABLE users ADD COLUMN stripe_customer_id TEXT;
  CREATE TABLE generation_events (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_generation_events_user_time ON generation_events(user_id, created_at);
  `,
    `
    ALTER TABLE generation_events ADD COLUMN category TEXT NOT NULL DEFAULT 'set';
    CREATE INDEX idx_generation_events_user_cat_time ON generation_events(user_id, category, created_at);
    `,
    `
    ALTER TABLE users ADD COLUMN billing_customer_id TEXT;
    ALTER TABLE users ADD COLUMN billing_provider TEXT;
    UPDATE users SET billing_customer_id = stripe_customer_id, billing_provider = 'stripe' WHERE stripe_customer_id IS NOT NULL;
    CREATE INDEX idx_users_billing_customer ON users(billing_customer_id);
    `,
    `
    ALTER TABLE sets ADD COLUMN server_updated_at TEXT;
    UPDATE sets SET server_updated_at = updated_at;
    CREATE INDEX idx_sets_user_server_updated ON sets(user_id, server_updated_at);
    
    ALTER TABLE cards ADD COLUMN server_updated_at TEXT;
    UPDATE cards SET server_updated_at = updated_at;
    CREATE INDEX idx_cards_user_server_updated ON cards(user_id, server_updated_at);
    
    ALTER TABLE quiz ADD COLUMN server_updated_at TEXT;
    UPDATE quiz SET server_updated_at = updated_at;
    CREATE INDEX idx_quiz_user_server_updated ON quiz(user_id, server_updated_at);
    
    ALTER TABLE review_log ADD COLUMN received_at TEXT;
    UPDATE review_log SET received_at = reviewed_at;
    CREATE INDEX idx_review_log_user_received ON review_log(user_id, received_at);
    
    UPDATE cards SET due_date = strftime('%Y-%m-%dT%H:%M:%f', CAST(due_date AS NUMERIC)/1000.0, 'unixepoch') || 'Z' WHERE due_date NOT LIKE '%-%' AND due_date IS NOT NULL;
    `
,
    `ALTER TABLE cards ADD COLUMN stability REAL;
    ALTER TABLE cards ADD COLUMN difficulty REAL;
    ALTER TABLE cards ADD COLUMN state TEXT;
    ALTER TABLE cards ADD COLUMN lapses INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE cards ADD COLUMN last_review TEXT;
    ALTER TABLE review_log ADD COLUMN kind TEXT NOT NULL DEFAULT 'flashcard';
    ALTER TABLE review_log ADD COLUMN stability REAL;
    ALTER TABLE review_log ADD COLUMN difficulty REAL;`

  ,
  `
  CREATE TABLE chains (
    id TEXT PRIMARY KEY,
    set_id TEXT NOT NULL REFERENCES sets(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    template TEXT NOT NULL,
    title TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    server_updated_at TEXT NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_chains_user_server_updated ON chains(user_id, server_updated_at);

  CREATE TABLE chain_steps (
    id TEXT PRIMARY KEY,
    chain_id TEXT NOT NULL REFERENCES chains(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id),
    key TEXT NOT NULL,
    statement TEXT NOT NULL,
    why TEXT NOT NULL,
    edited INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    server_updated_at TEXT NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_chain_steps_user_server_updated ON chain_steps(user_id, server_updated_at);
  `,
  `
  ALTER TABLE sets ADD COLUMN chain_overrides TEXT;
  `
  ,
  `
  CREATE TABLE categories (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    parent_id TEXT REFERENCES categories(id),
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL
  );
  
  CREATE INDEX idx_categories_slug ON categories(slug);

  CREATE TABLE user_interests (
    user_id TEXT NOT NULL REFERENCES users(id),
    category_id TEXT NOT NULL REFERENCES categories(id),
    weight REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, category_id)
  );

  ALTER TABLE sets ADD COLUMN origin_set_id TEXT;
  ALTER TABLE sets ADD COLUMN is_global INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE sets ADD COLUMN category_id TEXT REFERENCES categories(id);
  ALTER TABLE sets ADD COLUMN category_confidence REAL;
  ALTER TABLE sets ADD COLUMN category_model TEXT;
  ALTER TABLE sets ADD COLUMN categorised_at TEXT;
  ALTER TABLE sets ADD COLUMN categorised_card_count INTEGER;
  ALTER TABLE sets ADD COLUMN category_stale INTEGER NOT NULL DEFAULT 0;
  
  -- Insert seed categories
  INSERT INTO categories (id, slug, name, parent_id, created_at, created_by) VALUES
  ('cat_med', 'medicine', 'Medicine', NULL, '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_med_ana', 'anatomy', 'Anatomy', 'cat_med', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_med_phy', 'physiology', 'Physiology', 'cat_med', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_med_pha', 'pharmacology', 'Pharmacology', 'cat_med', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_med_pat', 'pathology', 'Pathology', 'cat_med', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_med_car', 'cardiology', 'Cardiology', 'cat_med', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_med_neu', 'neurology', 'Neurology', 'cat_med', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_med_cli', 'clinical-medicine', 'Clinical medicine', 'cat_med', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_med_lic', 'medical-licensing-exams', 'Medical licensing exams', 'cat_med', '2026-09-01T00:00:00.000Z', 'seed'),
  
  ('cat_nur', 'nursing', 'Nursing', NULL, '2026-09-01T00:00:00.000Z', 'seed'),
  
  ('cat_bio', 'biology', 'Biology', NULL, '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_bio_cel', 'cell-biology', 'Cell biology', 'cat_bio', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_bio_gen', 'genetics', 'Genetics', 'cat_bio', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_bio_imm', 'immunology', 'Immunology', 'cat_bio', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_bio_mic', 'microbiology', 'Microbiology', 'cat_bio', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_bio_eco', 'ecology', 'Ecology', 'cat_bio', '2026-09-01T00:00:00.000Z', 'seed'),

  ('cat_che', 'chemistry', 'Chemistry', NULL, '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_che_gen', 'general-chemistry', 'General chemistry', 'cat_che', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_che_org', 'organic-chemistry', 'Organic chemistry', 'cat_che', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_che_bio', 'biochemistry', 'Biochemistry', 'cat_che', '2026-09-01T00:00:00.000Z', 'seed'),

  ('cat_phy', 'physics', 'Physics', NULL, '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_phy_mec', 'mechanics', 'Mechanics', 'cat_phy', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_phy_ele', 'electromagnetism', 'Electromagnetism', 'cat_phy', '2026-09-01T00:00:00.000Z', 'seed'),

  ('cat_mat', 'mathematics', 'Mathematics', NULL, '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_mat_cal', 'calculus', 'Calculus', 'cat_mat', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_mat_lin', 'linear-algebra', 'Linear algebra', 'cat_mat', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_mat_sta', 'statistics-probability', 'Statistics & probability', 'cat_mat', '2026-09-01T00:00:00.000Z', 'seed'),

  ('cat_csc', 'computer-science', 'Computer Science', NULL, '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_csc_net', 'networking', 'Networking', 'cat_csc', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_csc_alg', 'algorithms-data-structures', 'Algorithms & data structures', 'cat_csc', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_csc_ope', 'operating-systems', 'Operating systems', 'cat_csc', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_csc_dat', 'databases', 'Databases', 'cat_csc', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_csc_sec', 'security', 'Security', 'cat_csc', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_csc_sys', 'system-design', 'System design', 'cat_csc', '2026-09-01T00:00:00.000Z', 'seed'),

  ('cat_prg', 'programming', 'Programming', NULL, '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_prg_jav', 'java', 'Java', 'cat_prg', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_prg_pyt', 'python', 'Python', 'cat_prg', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_prg_jst', 'javascript-typescript', 'JavaScript & TypeScript', 'cat_prg', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_prg_ccc', 'c-cpp', 'C & C++', 'cat_prg', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_prg_web', 'web-development', 'Web development', 'cat_prg', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_prg_mob', 'mobile-development', 'Mobile development', 'cat_prg', '2026-09-01T00:00:00.000Z', 'seed'),

  ('cat_dai', 'data-ai', 'Data & AI', NULL, '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_dai_mac', 'machine-learning', 'Machine learning', 'cat_dai', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_dai_ana', 'data-analysis', 'Data analysis', 'cat_dai', '2026-09-01T00:00:00.000Z', 'seed'),

  ('cat_eng', 'engineering', 'Engineering', NULL, '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_eng_ele', 'electrical-engineering', 'Electrical', 'cat_eng', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_eng_mec', 'mechanical-engineering', 'Mechanical', 'cat_eng', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_eng_civ', 'civil-engineering', 'Civil', 'cat_eng', '2026-09-01T00:00:00.000Z', 'seed'),

  ('cat_bus', 'business', 'Business', NULL, '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_bus_eco', 'economics', 'Economics', 'cat_bus', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_bus_fin', 'finance', 'Finance', 'cat_bus', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_bus_acc', 'accounting', 'Accounting', 'cat_bus', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_bus_mar', 'marketing', 'Marketing', 'cat_bus', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_bus_man', 'management', 'Management', 'cat_bus', '2026-09-01T00:00:00.000Z', 'seed'),

  ('cat_law', 'law', 'Law', NULL, '2026-09-01T00:00:00.000Z', 'seed'),

  ('cat_hum', 'humanities', 'Humanities', NULL, '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_hum_his', 'history', 'History', 'cat_hum', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_hum_phi', 'philosophy', 'Philosophy', 'cat_hum', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_hum_lit', 'literature', 'Literature', 'cat_hum', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_hum_art', 'art-music', 'Art & music', 'cat_hum', '2026-09-01T00:00:00.000Z', 'seed'),

  ('cat_soc', 'social-sciences', 'Social sciences', NULL, '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_soc_psy', 'psychology', 'Psychology', 'cat_soc', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_soc_soc', 'sociology', 'Sociology', 'cat_soc', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_soc_pol', 'political-science', 'Political science', 'cat_soc', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_soc_geo', 'geography', 'Geography', 'cat_soc', '2026-09-01T00:00:00.000Z', 'seed'),

  ('cat_lan', 'languages', 'Languages', NULL, '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_lan_spe', 'english-speaking', 'English speaking', 'cat_lan', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_lan_gra', 'english-grammar-vocabulary', 'English grammar & vocabulary', 'cat_lan', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_lan_spa', 'spanish', 'Spanish', 'cat_lan', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_lan_ger', 'german', 'German', 'cat_lan', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_lan_fre', 'french', 'French', 'cat_lan', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_lan_oth', 'other-languages', 'Other languages', 'cat_lan', '2026-09-01T00:00:00.000Z', 'seed'),

  ('cat_tst', 'test-prep', 'Test prep', NULL, '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_tst_sch', 'school-university-entrance-exams', 'School and university entrance exams', 'cat_tst', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_tst_lan', 'language-exams', 'Language exams', 'cat_tst', '2026-09-01T00:00:00.000Z', 'seed'),

  ('cat_ski', 'skills', 'Skills', NULL, '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_ski_pub', 'public-speaking', 'Public speaking', 'cat_ski', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_ski_wri', 'writing', 'Writing', 'cat_ski', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_ski_pro', 'productivity', 'Productivity', 'cat_ski', '2026-09-01T00:00:00.000Z', 'seed'),
  ('cat_ski_con', 'consumer-tech', 'Consumer tech', 'cat_ski', '2026-09-01T00:00:00.000Z', 'seed'),

  ('cat_oth', 'other', 'Other', NULL, '2026-09-01T00:00:00.000Z', 'seed');
  `
  ,
  `
    ALTER TABLE sets ADD COLUMN rating_sum INTEGER DEFAULT 0;
    ALTER TABLE sets ADD COLUMN rating_count INTEGER DEFAULT 0;
    ALTER TABLE sets ADD COLUMN rating_avg REAL;
    CREATE TABLE set_ratings (
      set_root_id TEXT NOT NULL REFERENCES sets(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      stars INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (set_root_id, user_id)
    );
    CREATE INDEX idx_set_ratings_root ON set_ratings(set_root_id);

    CREATE TABLE reports (
      id TEXT PRIMARY KEY,
      set_id TEXT NOT NULL REFERENCES sets(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      reason TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(set_id, user_id)
    );
    ALTER TABLE sets ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0;
    `
  ,
  `
  ALTER TABLE review_log ADD COLUMN duration_ms INTEGER;
  CREATE TABLE feedback (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id),
    text TEXT NOT NULL,
    image_data TEXT,
    app_version TEXT,
    platform TEXT,
    route TEXT,
    created_at TEXT NOT NULL
  );
  `
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
        // Plain strings for DDL — libSQL's HTTP client (Turso) requires `args`
        // on object-form statements, so bare `{ sql }` throws in production.
        ...stmts,
        { sql: "INSERT INTO migrations (name, applied_at) VALUES (?, ?)", args: [name, new Date().toISOString()] },
      ],
      "write"
    );
  }
}

export const uid = () => randomUUID();
export const nowISO = () => new Date().toISOString();
