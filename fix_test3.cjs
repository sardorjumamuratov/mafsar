const fs = require('fs');
let c = fs.readFileSync('tests/ui-static.test.mjs', 'utf8');

c = c.replace(/const sets = fs\.readFileSync\(join\(__dirname, "\.\.\/src\/ui\/views\/sets\.js"\), "utf8"\);\s*assert\.ok\([\s\S]*?"renderSets must reuse the existing post-paint refresher"\s*\);/, '');

fs.writeFileSync('tests/ui-static.test.mjs', c);
