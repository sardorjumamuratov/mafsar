import re

with open('server/src/llm.ts', 'r', encoding='utf-8') as f:
    code = f.read()

hint_old = '''const BOTTLENECK_HINT_PROMPT = You give ONE short hint for a find-the-bottleneck exercise: point at the
area to look at without naming the flaw. One sentence.

\

Respond with ONLY valid JSON: { "hint": string };

export async function generateBottleneckHint(state: string, uid?: string) {
  const s = openState<BottleneckState>(state, "planted_flaw", uid);
  if (s.practiceStyle === "simulation") throw new BadStateError("Hints are disabled in interview simulation.");
  const parsed = await callJson(BOTTLENECK_HINT_PROMPT, Architecture:\\n\\\n\\nPlanted flaw (do not reveal): \);
  return { hint: str(parsed?.hint, 300, "Follow a single write request end to end."), state: encryptState({ ...s, hintUsed: true }) };
}'''

hint_new = '''const BOTTLENECK_HINT_PROMPT = You give ONE short hint for a find-the-bottleneck exercise: point at the
area to look at without naming the flaw. One sentence.
The requested hint level is \. If level 1, be vague. If level 2, point to a specific interaction. If level 3, practically give away the component.

\

Respond with ONLY valid JSON: { "hint": string };

export async function generateBottleneckHint(input: { state: string; level?: number; uid?: string }) {
  const s = openState<BottleneckState>(input.state, "planted_flaw", input.uid);
  const isSimulation = s.practiceStyle === "simulation";
  const limit = isSimulation ? 1 : 3;
  const reqLevel = input.level || (s.hintLevel + 1);
  if (reqLevel > limit) throw new BadStateError("HINT_LIMIT_REACHED");

  // Asking for a hint we already have
  if (s.hints && s.hints.length >= reqLevel) {
    return {
      hint: s.hints[reqLevel - 1],
      text: s.hints[reqLevel - 1],
      level: reqLevel,
      penalty: isSimulation ? 0.5 : 0,
      revealsAnswer: false,
      state: input.state
    };
  }

  const prompt = BOTTLENECK_HINT_PROMPT.replace("\", String(reqLevel));
  const parsed = await callJson(prompt, Architecture:\\n\\\n\\nPlanted flaw (do not reveal): \);
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
}'''

code = code.replace(hint_old, hint_new)

with open('server/src/llm.ts', 'w', encoding='utf-8') as f:
    f.write(code)
