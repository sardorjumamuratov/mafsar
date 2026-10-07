import fs from "fs";
let code = fs.readFileSync("server/src/llm.ts", "utf8");

const estRegex = /const ESTIMATION_TASK_PROMPT = `[\s\S]*?export async function generateEstimationTasks[\s\S]*?\n\}/;

const estNew = `const ESTIMATION_TASK_PROMPT = \`You write back-of-the-envelope estimation questions for system design practice.
You get a topic and the learner's study cards. Write \${ESTIMATION_ROUND} questions grounded in that topic, each
asking for ONE number with a unit ("How much storage do 5 years of tweets need?", "Peak QPS for 50M
daily users at 20 requests each?"). State the assumptions needed to answer in the question.

Units must be one of: B, KB, MB, GB, TB, PB (bytes), bps, Kbps, Mbps, Gbps (bits per second),
B/s, KB/s, MB/s, GB/s (bytes per second), QPS, req/day, servers, users, or no unit for plain counts.

Respond with ONLY valid JSON:
{ "questions": [{
    "question": string,
    "reference_value": number,
    "reference_unit": string,
    "worked_solution": string,
    "nudge": string,
    "first_step": string,
    "scaffold": [string],
    "traffic": "average" | "peak" | null,
    "assumptions": [string]
}] }
worked_solution shows the arithmetic step by step in 2-5 short lines.
scaffold is an array of strings representing the equation, with "?" for unknown values. Must not contain the answer.
nudge is a small hint when they are stuck.
first_step gives them the very first arithmetic step to take.
\`;

export async function generateEstimationTasks(concept: string, reference: Ref[]) {
  const parsed = await callJson(ESTIMATION_TASK_PROMPT, \`Topic: \${concept}\\n\\nStudy cards:\\n\${refText(reference)}\`);
  const questions = (Array.isArray(parsed?.questions) ? parsed.questions : [])
    .map((q: any) => ({
      question: str(q?.question, 600),
      reference_value: Number(q?.reference_value),
      reference_unit: str(q?.reference_unit, 20),
      worked_solution: str(q?.worked_solution, 1200),
      nudge: str(q?.nudge, 500),
      first_step: str(q?.first_step, 500),
      scaffold: Array.isArray(q?.scaffold) ? q.scaffold.map((s: any) => str(s, 200)) : [],
      traffic: q?.traffic === "average" || q?.traffic === "peak" ? q.traffic : null,
      assumptions: Array.isArray(q?.assumptions) ? q.assumptions.map((a: any) => str(a, 200)) : []
    }))
    // A question without a usable positive answer can't be graded: drop it.
    .filter((q: any) => q.question && Number.isFinite(q.reference_value) && q.reference_value > 0)
    .slice(0, ESTIMATION_ROUND);
  if (questions.length < 3) throw new LLMError("The model didn\\'t return enough usable questions. Try again.");
  return { questions };
}`;

if (estRegex.test(code)) {
  code = code.replace(estRegex, estNew);
} else {
  console.log("Could not find match for estRegex");
}

fs.writeFileSync("server/src/llm.ts", code, "utf8");
