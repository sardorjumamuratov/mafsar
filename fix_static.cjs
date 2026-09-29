const fs = require('fs');
let c = fs.readFileSync('tests/ui-static.test.mjs', 'utf8');
c = c.replace(/assert\.equal\(callSites, 17/, "assert.equal(callSites, 19");
fs.writeFileSync('tests/ui-static.test.mjs', c);
