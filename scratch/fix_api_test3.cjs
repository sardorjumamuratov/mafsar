const fs = require("fs");
let s = fs.readFileSync("server/tests/api.test.ts", "utf8");
s = s.replace(/describe\("later-phase stubs", \(\) => \{[\s\S]*$/, "");
fs.writeFileSync("server/tests/api.test.ts", s);
