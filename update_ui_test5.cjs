const fs = require("fs");
let t = fs.readFileSync("tests/ui-static.test.mjs", "utf8");
t = t.replace(/const sheet = readSrc\("\.\.\/src\/ui\/confirm\.js"\);/, 'const sheet = readSrc("../src/ui/sheet.js");');
// Also the CSS test checks for .sheet-box, but we use .sheet-panel
t = t.replace(/\.includes\("\.sheet-box"\)/, '.includes(".sheet-panel")');
fs.writeFileSync("tests/ui-static.test.mjs", t);
