import os

with open('server/src/llm.ts', 'r', encoding='utf-8') as f:
    code = f.read()

# Add practiceStyle to BottleneckState
code = code.replace(
    "type BottleneckState = { narrative: string; architecture: string[]; planted_flaw: string; why_it_fails: string; model_solution: string; hintUsed?: boolean; uid?: string; iat?: number };",
    "type BottleneckState = { narrative: string; architecture: string[]; planted_flaw: string; why_it_fails: string; model_solution: string; hintUsed?: boolean; uid?: string; iat?: number; practiceStyle?: string };"
)

# generateBottleneckTask parameters and state
code = code.replace(
    "export async function generateBottleneckTask(concept: string, reference: Ref[], uid?: string) {",
    "export async function generateBottleneckTask(concept: string, reference: Ref[], uid?: string, practiceStyle?: string) {"
)
code = code.replace(
    "return { narrative, architecture, state: encryptState({ ...secret, uid, iat: Date.now() }) };",
    "return { narrative, architecture, state: encryptState({ ...secret, uid, iat: Date.now(), practiceStyle }) };"
)

# generateBottleneckHint validation
code = code.replace(
    "export async function generateBottleneckHint(state: string, uid?: string) {\n  const s = openState<BottleneckState>(state, \"planted_flaw\", uid);",
    "export async function generateBottleneckHint(state: string, uid?: string) {\n  const s = openState<BottleneckState>(state, \"planted_flaw\", uid);\n  if (s.practiceStyle === \"simulation\") throw new BadStateError(\"Hints are disabled in interview simulation.\");"
)

# gradeBottleneckAnswer scoring
code = code.replace(
    "const score = Math.max(0, Number(found_flaw) + Number(explanation_correct) + Number(fix_works) - (usedHint ? 0.5 : 0));",
    "const effectivelyUsedHint = s.hintUsed || usedHint;\n    const score = Math.max(0, Number(found_flaw) + Number(explanation_correct) + Number(fix_works) - (effectivelyUsedHint ? 0.5 : 0));"
)
code = code.replace(
    "usedHint,",
    "usedHint: effectivelyUsedHint,"
)

with open('server/src/llm.ts', 'w', encoding='utf-8') as f:
    f.write(code)
