const fs = require("fs");
let t = fs.readFileSync("tests/ui-static.test.mjs", "utf8");
t = t.replace(/assert\.ok\(src\.includes\("confirm\("\), "asks before replacing"\);/, 'assert.ok(src.includes("confirm(") || src.includes("confirmSheet("), "asks before replacing");');
fs.writeFileSync("tests/ui-static.test.mjs", t);
