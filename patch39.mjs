import fs from "fs";
let code = fs.readFileSync("server/src/llm.ts", "utf8");

const estSummaryRegex = /const ESTIMATION_SUMMARY_PROMPT = `[\s\S]*?export async function generateEstimationSummary[\s\S]*?\n\}/;

const estSummaryNew = `const ESTIMATION_SUMMARY_PROMPT = \`You review a learner's round of estimation answers (each graded
spot_on / ballpark / off by order of magnitude). In ONE sentence, name the single most useful habit to
fix (for example forgetting replication, mixing bits and bytes, per-day vs per-second). If they did
well, say what to keep doing. Include up to 5 brief coaching notes grounded in their working (if any),
without giving a second score.

\${DRILL_RULES}

Respond with ONLY valid JSON: {
  "habit_to_fix": string,
  "strongest_habit": string | null,
  "notes": [{ "index": number, "message": string }]
}\`;

export async function generateEstimationSummary(results: { question: string; expected: string; answer: string; grade: string; working?: string }[]) {
  try {
    const parsed = await callJson(ESTIMATION_SUMMARY_PROMPT, JSON.stringify(results));
    return {
      habit_to_fix: str(parsed?.habit_to_fix, 400, "Keep practising your estimates."),
      strongest_habit: str(parsed?.strongest_habit, 400) || null,
      notes: (Array.isArray(parsed?.notes) ? parsed.notes : [])
        .map((n: any) => ({ index: Number(n?.index), message: str(n?.message, 200) }))
        .filter((n: any) => Number.isFinite(n.index) && n.message)
        .slice(0, 5)
    };
  } catch (e) {
    return { habit_to_fix: "We could not analyze the working this time, but your numerical answer was checked." };
  }
}`;

if (estSummaryRegex.test(code)) {
  code = code.replace(estSummaryRegex, estSummaryNew);
} else {
  console.log("Could not find match for estSummaryRegex");
}

fs.writeFileSync("server/src/llm.ts", code, "utf8");
