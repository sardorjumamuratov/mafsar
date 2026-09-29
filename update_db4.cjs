const fs = require("fs");
let c = fs.readFileSync("server/src/db.ts", "utf8");
c = c.replace(/ALTER TABLE sets ADD COLUMN chain_overrides TEXT;\s*`\s*\];/, `ALTER TABLE sets ADD COLUMN chain_overrides TEXT;
    \`,
    \`
    ALTER TABLE sets ADD COLUMN description TEXT;
    \`
];`);
fs.writeFileSync("server/src/db.ts", c);
