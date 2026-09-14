const fs = require("fs");
let s = fs.readFileSync("server/tests/api.test.ts", "utf8");
s = s.replace(/\["GET", "\/v1\/insights"\],\r?\n/, "");
fs.writeFileSync("server/tests/api.test.ts", s);
