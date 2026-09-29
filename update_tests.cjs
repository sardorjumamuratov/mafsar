const fs = require("fs");
let m = fs.readFileSync("server/tests/migrations.test.ts", "utf8");
m = m.replace(/"576c70bdecd70a3c",\n\]/, '"576c70bdecd70a3c",\n  "25dcb3f149827527",\n]');
fs.writeFileSync("server/tests/migrations.test.ts", m);

let s = fs.readFileSync("server/tests/schema.test.ts", "utf8");
s = s.replace(/toBe\(16\); \/\/ one per MIGRATIONS entry/, 'toBe(17); // one per MIGRATIONS entry');
fs.writeFileSync("server/tests/schema.test.ts", s);
