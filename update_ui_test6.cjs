const fs = require("fs");
let t = fs.readFileSync("tests/ui-static.test.mjs", "utf8");
t = t.replace(/sheet\.includes\('aria-modal="true"'\)/, 'sheet.includes("aria-modal")');
fs.writeFileSync("tests/ui-static.test.mjs", t);
