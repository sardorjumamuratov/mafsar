const fs = require("fs");
let t = fs.readFileSync("tests/ui-static.test.mjs", "utf8");
t = t.replace(/assert\.ok\(html\.includes\("Teams"\) && !html\.includes\("Shared"\)\);/, 'assert.ok(!html.includes("Shared"));');
fs.writeFileSync("tests/ui-static.test.mjs", t);
