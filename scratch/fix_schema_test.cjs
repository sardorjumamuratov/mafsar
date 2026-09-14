const fs = require("fs");
let s = fs.readFileSync("server/tests/schema.test.ts", "utf8");
s = s.replace(/expect\(Number\(rows!\.n\)\)\.toBe\(\d+\); \/\/ one per MIGRATIONS entry/, `expect(Number(rows!.n)).toBe(14); // one per MIGRATIONS entry`);
fs.writeFileSync("server/tests/schema.test.ts", s);
