const fs = require('fs');
let c = fs.readFileSync('tests/ui-static.test.mjs', 'utf8');

c = c.replace(/const fn = fs\.readFileSync\(join\(__dirname, "\.\.\/src\/ui\/views\/sets\.js"\), "utf8"\);/, `const fn = fs.readFileSync(join(__dirname, "../src/ui/views/import.js"), "utf8");`);

// Wait, what about other tests? "tests cover: the dock is in the shell and not in sets.js; the Sets view has no capture buttons or share form; the share form is in the Import view with the duplicate check; the permission request still comes before any await; the dock is hidden when showChrome(false); the label follows the source kind."
fs.writeFileSync('tests/ui-static.test.mjs', c);
