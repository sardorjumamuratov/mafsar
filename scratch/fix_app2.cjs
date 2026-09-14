const fs = require("fs");
let s = fs.readFileSync("server/src/app.ts", "utf8");
s = s.replace(/const db = c\.get\("db"\);\r?\n/, "");
fs.writeFileSync("server/src/app.ts", s);
