import fs from "fs";
let code = fs.readFileSync("server/src/schema.ts", "utf8");

const checkpointSchema = `export const designCheckpointSchema = z.object({
  step: z.string().max(200),
  brief: z.string().max(2000),
  answer: z.string().max(4000)
});
`;

code = code.replace(
  'export const designCurveballSchema = z.object({',
  checkpointSchema + '\nexport const designCurveballSchema = z.object({'
);

fs.writeFileSync("server/src/schema.ts", code, "utf8");
