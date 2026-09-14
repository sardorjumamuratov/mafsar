const fs = require("fs");
let s = fs.readFileSync("server/src/schema.ts", "utf8");
s = s.replace(/updatedAt: z\.string\(\),\r?\n  deleted: z\.boolean\(\)\.optional\(\),\r?\n}\);/g, `updatedAt: z.string(),\n  deleted: z.boolean().optional(),\n  stability: z.number().nullable().optional(),\n  difficulty: z.number().nullable().optional(),\n  state: z.string().nullable().optional(),\n  lapses: z.number().int().nullable().optional(),\n  lastReview: z.string().nullable().optional(),\n});`);
s = s.replace(/reviewedAt: z\.string\(\),\r?\n}\);/g, `reviewedAt: z.string(),\n  kind: z.string().default("flashcard"),\n  stability: z.number().nullable().optional(),\n  difficulty: z.number().nullable().optional(),\n});`);
fs.writeFileSync("server/src/schema.ts", s);
