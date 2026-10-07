import fs from "fs";
let code = fs.readFileSync("server/src/llm.ts", "utf8");

const checkpointFunc = `const DESIGN_CHECKPOINT_PROMPT = \`You are coaching a learner on a system design brief. 
They have written a draft for one section of the design (\${step}).
Identify ONE useful strength they covered, and ONE missing high-value idea they should consider adding.
Be very concise (one short sentence each). Do not grade them.

Respond with ONLY valid JSON:
{ "strength": string, "gap": string }
\`;

export async function generateDesignCheckpoint(step: string, brief: string, answer: string) {
  const parsed = await callJson(DESIGN_CHECKPOINT_PROMPT.replace("\${step}", step), \`Brief:\\n\${brief}\\n\\nLearner's answer for \${step}:\\n\${answer}\`);
  return {
    strength: str(parsed?.strength, 300),
    gap: str(parsed?.gap, 300)
  };
}
`;

code = code.replace(
  '// --- Find the bottleneck --------------------------------------------------------',
  checkpointFunc + '\n// --- Find the bottleneck --------------------------------------------------------'
);

fs.writeFileSync("server/src/llm.ts", code, "utf8");
