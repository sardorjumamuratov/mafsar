import fs from "fs";
let code = fs.readFileSync("server/src/llm.ts", "utf8");

const newFunc = `
const DRILL_SUGGESTION_PROMPT = \`You turn a learner's mistakes in a system design drill into active-recall flashcards.
You are given the topic, their gaps/mistakes, and a list of existing cards to avoid duplicating.
Generate up to 3 flashcards addressing the most critical gaps. Each card must teach a transferable concept, not the exact scenario from the drill.

\${DRILL_RULES}

Respond with ONLY valid JSON:
{
  "suggestions": [
    {
      "id": string, // unique random slug
      "front": string, // a clear, active-recall question
      "back": string, // a concise, accurate explanation
      "conceptKey": string, // short label for the concept
      "sourceType": string, // which gap type this addresses
      "reason": string // brief note to the learner on why this helps
    }
  ]
}\`;

export async function generateDrillCardSuggestions(input: {
  mode: string;
  gaps: { type: string; text: string }[];
  topic: string;
  existingFronts?: string[];
}) {
  if (!input.gaps || input.gaps.length === 0) return { suggestions: [] };
  const user = [
    \`Topic: \${input.topic}\`,
    \`Mode: \${input.mode}\`,
    \`Gaps:\`,
    ...input.gaps.map(g => \`- [\${g.type}] \${g.text}\`),
    input.existingFronts && input.existingFronts.length > 0 ? \`\\nAvoid these existing questions:\\n\${input.existingFronts.map(f => \`- \${f}\`).join("\\n")}\` : ""
  ].join("\\n");
  
  const parsed = await callJson(DRILL_SUGGESTION_PROMPT, user);
  const suggestions = (Array.isArray(parsed?.suggestions) ? parsed.suggestions : [])
    .map((s: any) => ({
      id: str(s?.id, 50, "rnd"),
      front: str(s?.front, 160),
      back: str(s?.back, 400),
      conceptKey: str(s?.conceptKey, 100),
      sourceType: str(s?.sourceType, 50),
      reason: str(s?.reason, 200)
    }))
    .filter((s: any) => s.front && s.back)
    .slice(0, 3);
    
  return { suggestions };
}
`;

if (!code.includes("generateDrillCardSuggestions")) {
  code += newFunc;
  fs.writeFileSync("server/src/llm.ts", code, "utf8");
  console.log("Added generateDrillCardSuggestions");
} else {
  console.log("Already present");
}
