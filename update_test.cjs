const fs = require('fs');
let c = fs.readFileSync('server/tests/migrations.test.ts', 'utf8');
c = c.replace(/"51e0f0e615230e98", \/\/ 016 sets\.chain_overrides\s*\];/, `"51e0f0e615230e98", // 016 sets.chain_overrides\n    "98d7dba375e52653", // 017 prompts 34-36\n  ];`);
fs.writeFileSync('server/tests/migrations.test.ts', c);

let c2 = fs.readFileSync('server/tests/schema.test.ts', 'utf8');
c2 = c2.replace(/expect\(MIGRATIONS\.length\)\.toBe\(16\);/, `expect(MIGRATIONS.length).toBe(17);`);
fs.writeFileSync('server/tests/schema.test.ts', c2);
