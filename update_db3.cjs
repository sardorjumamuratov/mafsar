const fs = require('fs');
let c = fs.readFileSync('server/src/db.ts', 'utf8');

const migration = `,
  \`
  ALTER TABLE sets ADD COLUMN category TEXT;
  ALTER TABLE sets ADD COLUMN topic TEXT;
  ALTER TABLE sets ADD COLUMN published INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE sets ADD COLUMN published_at TEXT;
  ALTER TABLE sets ADD COLUMN reports INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE sets ADD COLUMN cards_changed_since_label INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE sets ADD COLUMN rating INTEGER;

  CREATE TABLE set_reports (
    set_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (set_id, user_id)
  );
  \`
];`;

c = c.replace(/\n];/, migration);
fs.writeFileSync('server/src/db.ts', c);
