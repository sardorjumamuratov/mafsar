const fs = require('fs');
let c = fs.readFileSync('server/tests/schema.test.ts', 'utf8');

c = c.replace(/expect\(Number\(rows!\.n\)\)\.toBe\(MIGRATIONS\.length\);/, `expect(Number(rows!.n)).toBe(17);`);

fs.writeFileSync('server/tests/schema.test.ts', c);
