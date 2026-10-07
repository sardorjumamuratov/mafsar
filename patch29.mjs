
import fs from "fs";

let code = fs.readFileSync("server/src/llm.ts", "utf8");

const hintOld = `const BOTTLENECK_HINT_PROMPT = \`You give ONE short hint for a find-the-bottleneck exercise: point at the
area to look at without naming the flaw. One sentence.

\${DRILL_RULES}

Respond with ONLY valid JSON: { "hint": string }\`;

export async function generateBottleneckHint(state: string, uid?: string) {
  const s = openState<BottleneckState>(state, "planted_flaw", uid);
  if (s.practiceStyle === "simulation") throw new BadStateError("Hints are disabled in interview simulation.");
  const parsed = await callJson(BOTTLENECK_HINT_PROMPT, \`Architecture:\\n\${s.architecture.join(" > ")}\\n\\nPlanted flaw (do not reveal): \${s.planted_flaw}\`);
  return { hint: str(parsed?.hint, 300, "Follow a single write request end to end."), state: encryptState({ ...s, hintUsed: true }) };
}`;

const hintNew = `const BOTTLENECK_HINT_PROMPT = \`You give ONE short hint for a find-the-bottleneck exercise: point at the
area to look at without naming the flaw. One sentence.
The requested hint level is \${level}. If level 1, be vague. If level 2, point to a specific interaction. If level 3, practically give away the component.

\${DRILL_RULES}

Respond with ONLY valid JSON: { "hint": string }\`;

export async function generateBottleneckHint(input: { state: string; level?: number; uid?: string }) {
  const s = openState<BottleneckState>(input.state, "planted_flaw", input.uid);
  const isSimulation = s.practiceStyle === "simulation";
  const limit = isSimulation ? 1 : 3;
  const reqLevel = input.level || ((s.hintLevel || 0) + 1);
  if (reqLevel > limit) throw new BadStateError("HINT_LIMIT_REACHED");

  // Asking for a hint we already have
  if (s.hints && s.hints.length >= reqLevel && s.hints[reqLevel - 1]) {
    return {
      hint: s.hints[reqLevel - 1],
      text: s.hints[reqLevel - 1],
      level: reqLevel,
      penalty: isSimulation ? 0.5 : 0,
      revealsAnswer: false,
      state: input.state
    };
  }

  const prompt = BOTTLENECK_HINT_PROMPT.replace("\\\${level}", String(reqLevel));
  const parsed = await callJson(prompt, \`Architecture:\\n\${(s.components || []).map(c => c.name).join(" > ")}\\n\\nPlanted flaw (do not reveal): \${s.planted_flaw}\`);
  const hintText = str(parsed?.hint, 300, "Follow a single write request end to end.");
  
  const hints = [...(s.hints || [])];
  hints[reqLevel - 1] = hintText;
  
  const newState = { ...s, hints, hintLevel: Math.max(s.hintLevel || 0, reqLevel) };
  return {
    hint: hintText,
    text: hintText,
    level: reqLevel,
    penalty: isSimulation ? 0.5 : 0,
    revealsAnswer: false,
    state: encryptState(newState)
  };
}`;

if (code.includes(hintOld)) {
  code = code.replace(hintOld, hintNew);
} else {
  console.log("Could not find hintOld");
}

fs.writeFileSync("server/src/llm.ts", code, "utf8");

