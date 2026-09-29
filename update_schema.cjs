const fs = require('fs');
let c = fs.readFileSync('server/src/schema.ts', 'utf8');
c = c.replace(/chainOverrides: z\.record\(z\.string\(\)\)\.optional\(\),/, `$&\n  rating: z.number().int().min(1).max(5).nullable().optional(),`);
fs.writeFileSync('server/src/schema.ts', c);
