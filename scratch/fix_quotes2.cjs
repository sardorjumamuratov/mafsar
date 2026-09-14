const fs = require("fs");
let s = fs.readFileSync("server/src/sync.ts", "utf8");
s = s.split("\"(pending set)\"").join("'(pending set)'");
s = s.split("\\\"(pending set)\\\"").join("'(pending set)'");
fs.writeFileSync("server/src/sync.ts", s);
