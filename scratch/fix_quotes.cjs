const fs = require("fs");
let s = fs.readFileSync("server/src/sync.ts", "utf8");
s = s.replace(/\"\(pending set\)\"/g, "'(pending set)'");
fs.writeFileSync("server/src/sync.ts", s);
