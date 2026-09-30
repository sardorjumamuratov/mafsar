const fs = require("fs");
let code = fs.readFileSync("server/src/db.ts", "utf8");
code = code.replace(
  '  );\n  `\n  `\n    ALTER TABLE cards',
  '  );\n  `,\n  `\n    ALTER TABLE cards'
);
fs.writeFileSync("server/src/db.ts", code);
