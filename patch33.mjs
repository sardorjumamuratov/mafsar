import fs from "fs";
let code = fs.readFileSync("server/src/llm.ts", "utf8");

const gradeRegex = /const BOTTLENECK_GRADE_PROMPT = `[\s\S]*?export async function gradeBottleneckAnswer[\s\S]*?\n\}/;

const gradeNew = `const BOTTLENECK_GRADE_PROMPT = \`You grade a find-the-bottleneck answer on three criteria:
1. foundFlaw: did the learner identify the planted flaw, OR a different problem that is genuinely real in this design?
2. explainedFailure: is their explanation of why it fails right?
3. proposedFix: does their fix solve it, and is its trade-off acknowledged?

\${DRILL_RULES}

Respond with ONLY valid JSON:
{
  "criteria": {
    "foundFlaw": { "status": "covered" | "partial" | "missed", "note": string },
    "explainedFailure": { "status": "covered" | "partial" | "missed", "note": string },
    "proposedFix": { "status": "covered" | "partial" | "missed", "note": string }
  },
  "verdict": "correct" | "partly_right" | "not_quite",
  "feedback": string,
  "strongestPart": string | null,
  "highestLeverageGap": string | null,
  "alternateProblem": { "componentId": string, "description": string } | null
}\`;

export async function gradeBottleneckAnswer(input: {
  state: string;
  answer?: string;
  usedHint?: boolean;
  uid?: string;
  practiceStyle?: string;
  selectedComponentId?: string;
  parts?: { flaw?: string; reason?: string; fix?: string; tradeoff?: string };
}) {
  const s = openState<BottleneckState>(input.state, "planted_flaw", input.uid);
  let finalAnswer = input.answer || "";
  if (input.parts && Object.values(input.parts).some(v => v && typeof v === "string" && v.trim())) {
    const p = input.parts;
    finalAnswer = [
      p.flaw ? \`Flaw: \${p.flaw}\` : "",
      p.reason ? \`Reason: \${p.reason}\` : "",
      p.fix ? \`Fix: \${p.fix}\` : "",
      p.tradeoff ? \`Trade-off: \${p.tradeoff}\` : ""
    ].filter(Boolean).join("\\n\\n");
  }

  const user = [
    \`Scenario:\\n\${s.narrative}\`,
    \`Architecture:\\n\${(s.components || []).map(c => c.name).join(" → ")}\`,
    \`Planted flaw:\\n\${s.planted_flaw}\`,
    \`Why it fails:\\n\${s.why_it_fails}\`,
    \`Learner\\'s answer:\\n\${finalAnswer}\`,
  ].join("\\n\\n");
  const parsed = await callJson(BOTTLENECK_GRADE_PROMPT, user);

  // Score mapping: covered=1, partial=0.5, missed=0
  const criteria = {
    foundFlaw: { status: parsed?.criteria?.foundFlaw?.status || "missed", note: parsed?.criteria?.foundFlaw?.note || "", earned: 0 },
    explainedFailure: { status: parsed?.criteria?.explainedFailure?.status || "missed", note: parsed?.criteria?.explainedFailure?.note || "", earned: 0 },
    proposedFix: { status: parsed?.criteria?.proposedFix?.status || "missed", note: parsed?.criteria?.proposedFix?.note || "", earned: 0 }
  };
  let score = 0;
  for (const k of ["foundFlaw", "explainedFailure", "proposedFix"]) {
    const val = (criteria as any)[k].status === "covered" ? 1 : (criteria as any)[k].status === "partial" ? 0.5 : 0;
    (criteria as any)[k].earned = val;
    score += val;
  }

  const v2Hint = Array.isArray(s.hints) && s.hints.length > 0;
  const effectivelyUsedHint = v2Hint || input.usedHint;
  const isSimulation = s.practiceStyle === "simulation" || input.practiceStyle === "simulation";
  const hintPenalty = (isSimulation && effectivelyUsedHint) ? 0.5 : 0;
  
  const finalScore = Math.max(0, score - hintPenalty);

  let selectedComponentResult = null;
  if (input.selectedComponentId) {
    if (s.flaw_component_id === input.selectedComponentId) {
      selectedComponentResult = { componentId: input.selectedComponentId, status: "flaw" };
    } else if (parsed?.alternateProblem && parsed.alternateProblem.componentId === input.selectedComponentId) {
      selectedComponentResult = { componentId: input.selectedComponentId, status: "alternate" };
    } else {
      selectedComponentResult = { componentId: input.selectedComponentId, status: "not_the_flaw" };
    }
  }

  return {
    feedback: str(parsed?.feedback, 600, "Good attempt."),
    score: finalScore,
    usedHint: effectivelyUsedHint,
    planted_flaw: s.planted_flaw,
    why_it_fails: s.why_it_fails,
    model_solution: s.model_solution,
    maxScore: 3,
    hintPenalty,
    finalScore,
    verdict: parsed?.verdict || "not_quite",
    criteria,
    selectedComponentResult,
    failingComponentId: s.flaw_component_id,
    strongestPart: str(parsed?.strongestPart, 500) || null,
    highestLeverageGap: str(parsed?.highestLeverageGap, 500) || null,
    alternateProblem: parsed?.alternateProblem ? { componentId: str(parsed.alternateProblem.componentId, 100), description: str(parsed.alternateProblem.description, 400) } : null,
    modelAnswer: { flaw: s.planted_flaw, whyItFails: s.why_it_fails, goodFix: s.model_solution, tradeoff: s.tradeoff }
  };
}`;

if (gradeRegex.test(code)) {
  code = code.replace(gradeRegex, gradeNew);
} else {
  console.log("Could not find match for gradeRegex");
}

fs.writeFileSync("server/src/llm.ts", code, "utf8");
