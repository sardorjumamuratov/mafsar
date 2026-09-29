const fs = require("fs");
let c = fs.readFileSync("server/src/schema.ts", "utf8");
c = c.replace(/chainOverrides: z\.record\(z\.string\(\)\)\.optional\(\),/, `chainOverrides: z.record(z.string()).optional(),
  description: z.string().nullable().optional(),`);
fs.writeFileSync("server/src/schema.ts", c);
