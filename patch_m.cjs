const fs = require("fs");
let m = fs.readFileSync("server/tests/migrations.test.ts", "utf8");
m = m.replace(
  '  "e8ae3be71844c239", // 019 stats\n];',
  '  "e8ae3be71844c239", // 019 stats\n  "0653877694e07b2c", // 020 copies\n];'
);
fs.writeFileSync("server/tests/migrations.test.ts", m);
