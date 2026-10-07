import os

with open('server/src/llm.ts', 'r', encoding='utf-8') as f:
    code = f.read()

code = code.replace(
    "type BottleneckState = { narrative: string; architecture: string[]; planted_flaw: string; why_it_fails: string; model_solution: string };",
    "type BottleneckState = { narrative: string; architecture: string[]; planted_flaw: string; why_it_fails: string; model_solution: string; hintUsed?: boolean; uid?: string; iat?: number };"
)

code = code.replace(
    "return { hint: str(parsed?.hint, 300, \"Follow a single write request end to end.\") };",
    "return { hint: str(parsed?.hint, 300, \"Follow a single write request end to end.\"), state: encryptState({ ...s, hintUsed: true }) };"
)

with open('server/src/llm.ts', 'w', encoding='utf-8') as f:
    f.write(code)
