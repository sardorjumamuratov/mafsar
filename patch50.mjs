import fs from "fs";
let code = fs.readFileSync("server/src/schema.ts", "utf8");

const newSchemas = `
export const drillCardSuggestionsSchema = z.object({
  mode: z.enum(["design", "estimation", "bottleneck"]),
  gaps: z.array(z.object({
    type: z.enum(["missed_rubric", "partial_rubric", "estimation_mistake", "unit_mismatch", "missed_bottleneck", "missing_tradeoff"]),
    text: z.string().max(400)
  })).max(8),
  topic: z.string().max(200),
  existingFronts: z.array(z.string().max(200)).max(50).optional(),
  practiceStyle: z.enum(["guided", "simulation"]).optional()
});
`;

if (!code.includes("drillCardSuggestionsSchema")) {
  code += newSchemas;
  fs.writeFileSync("server/src/schema.ts", code, "utf8");
  console.log("Added drillCardSuggestionsSchema");
} else {
  console.log("Already present");
}
