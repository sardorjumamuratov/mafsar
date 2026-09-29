const fs = require('fs');
let c = fs.readFileSync('tests/ui-static.test.mjs', 'utf8');
c = c.replace(/assert\.equal\(callSites, 14, "exactly the view-renderer exits reset scroll"\);/, `assert.equal(callSites, 17, "exactly the view-renderer exits reset scroll");`);
fs.writeFileSync('tests/ui-static.test.mjs', c);
