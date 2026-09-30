const fs = require("fs");

let m = fs.readFileSync("server/tests/migrations.test.ts", "utf8");
m = m.replace(
  '] as const;',
  ', "0653877694e07b2c"] as const;'
);
fs.writeFileSync("server/tests/migrations.test.ts", m);

let s = fs.readFileSync("server/tests/schema.test.ts", "utf8");
s = s.replace('expect(Number(rows!.n)).toBe(19);', 'expect(Number(rows!.n)).toBe(20);');
fs.writeFileSync("server/tests/schema.test.ts", s);
