const fs = require('fs');
let code = fs.readFileSync('server/src/schema.ts', 'utf8');

code = code.replace(
  /export const designGradeSchema = z\.object\(\{/,
  'export const designGradeSchema = z.object({\n  practiceStyle: z.enum(["guided", "simulation"]).optional(),'
);

code = code.replace(
  /answer: z\.string\(\)\.min\(1\)\.max\(MAX_DESIGN_ANSWER\),/,
  'answer: z.union([z.string().min(1).max(MAX_DESIGN_ANSWER), z.record(z.string(), z.string().max(MAX_DESIGN_ANSWER)).refine(obj => JSON.stringify(obj).length <= MAX_DESIGN_ANSWER, "Answer payload too large")]),'
);

code = code.replace(
  /export const bottleneckGradeSchema = z\.object\(\{/,
  'export const bottleneckGradeSchema = z.object({\n  practiceStyle: z.enum(["guided", "simulation"]).optional(),'
);

code = code.replace(
  /export const estimationSummarySchema = z\.object\(\{/,
  'export const estimationSummarySchema = z.object({\n  practiceStyle: z.enum(["guided", "simulation"]).optional(),'
);

fs.writeFileSync('server/src/schema.ts', code);
