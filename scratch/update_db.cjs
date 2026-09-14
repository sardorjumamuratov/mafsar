const fs = require("fs");
let s = fs.readFileSync("server/src/db.ts", "utf8");
s = s.replace(
  /];\r?\n\r?\nexport async function migrate\(db: DB\): Promise<void> {/,
  `,\n    \`ALTER TABLE cards ADD COLUMN stability REAL;\n    ALTER TABLE cards ADD COLUMN difficulty REAL;\n    ALTER TABLE cards ADD COLUMN state TEXT;\n    ALTER TABLE cards ADD COLUMN lapses INTEGER NOT NULL DEFAULT 0;\n    ALTER TABLE cards ADD COLUMN last_review TEXT;\n    ALTER TABLE review_log ADD COLUMN kind TEXT NOT NULL DEFAULT 'flashcard';\n    ALTER TABLE review_log ADD COLUMN stability REAL;\n    ALTER TABLE review_log ADD COLUMN difficulty REAL;\`\n];\n\nexport async function migrate(db: DB): Promise<void> {`
);
fs.writeFileSync("server/src/db.ts", s);
