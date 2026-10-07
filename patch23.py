import re

with open('server/src/llm.ts', 'r', encoding='utf-8') as f:
    code = f.read()

prompt_old = '''const BOTTLENECK_GRADE_PROMPT = You grade a find-the-bottleneck answer on three separate parts:
1. found_flaw: did the learner identify the planted flaw, OR a different problem that is genuinely
   real in this design (then set "other_valid_issue")?
2. explanation_correct: is their explanation of why it fails (under what load or failure) right?
3. fix_works: does their fix actually solve it, with its trade-off acknowledged?

\

Respond with ONLY valid JSON:
{ "found_flaw": boolean, "other_valid_issue": string, "explanation_correct": boolean, "fix_works": boolean, "feedback": string };'''

prompt_new = '''const BOTTLENECK_GRADE_PROMPT = You grade a find-the-bottleneck answer on three criteria:
1. foundFlaw: did the learner identify the planted flaw, OR a different problem that is genuinely real in this design?
2. explainedFailure: is their explanation of why it fails right?
3. proposedFix: does their fix solve it, and is its trade-off acknowledged?

\

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
};'''

code = code.replace(prompt_old, prompt_new)

with open('server/src/llm.ts', 'w', encoding='utf-8') as f:
    f.write(code)
