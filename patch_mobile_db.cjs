const fs = require("fs");
let code = fs.readFileSync("mobile/src/db/index.ts", "utf8");

const tableSets = "exam_date TEXT,\n      created_at TEXT NOT NULL,";
const injectSets = "description TEXT,\n      exam_date TEXT,\n      created_at TEXT NOT NULL,\n      origin_set_id TEXT,\n      renamed INTEGER NOT NULL DEFAULT 0,";
code = code.replace(tableSets, injectSets);

const tableCards = "last_review INTEGER,\n      updated_at TEXT NOT NULL,";
const injectCards = "last_review INTEGER,\n      updated_at TEXT NOT NULL,\n      origin_card_id TEXT,\n      detached INTEGER NOT NULL DEFAULT 0,";
code = code.replace(tableCards, injectCards);

const tableLog = "reviewed_at TEXT NOT NULL,\n      dirty INTEGER NOT NULL DEFAULT 0";
const injectLog = "reviewed_at TEXT NOT NULL,\n      duration_ms INTEGER,\n      dirty INTEGER NOT NULL DEFAULT 0";
code = code.replace(tableLog, injectLog);

const migration = `
  const dbVersion = await db.getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = 'version'");
  const currentVersion = parseInt(dbVersion?.value || "1", 10);
  if (currentVersion < 2) {
    await db.execAsync(\`
      ALTER TABLE sets ADD COLUMN description TEXT;
      ALTER TABLE sets ADD COLUMN origin_set_id TEXT;
      ALTER TABLE sets ADD COLUMN renamed INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE cards ADD COLUMN origin_card_id TEXT;
      ALTER TABLE cards ADD COLUMN detached INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE review_log ADD COLUMN duration_ms INTEGER;
    \`);
    await db.execAsync("INSERT OR REPLACE INTO meta (key, value) VALUES ('version', '2')");
  }
`;

code = code.replace('return db;', migration + '\n  return db;');
fs.writeFileSync("mobile/src/db/index.ts", code);
