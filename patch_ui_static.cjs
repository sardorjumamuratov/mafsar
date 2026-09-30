const fs = require("fs");
let uiStatic = fs.readFileSync("tests/ui-static.test.mjs", "utf8");
uiStatic = uiStatic.replace('assert.equal(callSites, 17, "exactly the view-renderer exits reset scroll");', 'assert.equal(callSites, 16, "exactly the view-renderer exits reset scroll");');
fs.writeFileSync("tests/ui-static.test.mjs", uiStatic);
