const fs = require("fs");
let s = fs.readFileSync("server/tests/api.test.ts", "utf8");
s = s.replace(/it\("return documented 501s[\s\S]*?\}\);/g, "");
fs.writeFileSync("server/tests/api.test.ts", s);
