import re

with open('server/src/llm.ts', 'r', encoding='utf-8') as f:
    code = f.read()

code = code.replace(
    '"sections": [{ "section": string, "verdict": "strong" | "ok" | "weak" | "missing", "note": string }],',
    '"sections": [{ "section": string, "key": "requirements" | "estimates" | "api" | "dataModel" | "components" | "tradeoffs", "verdict": "strong" | "ok" | "weak" | "missing", "note": string }],\n  "strongestPart": string | null,\n  "highestLeverageGap": string | null,'
)

code = code.replace(
    'original design to it.',
    'original design to it. API and data-model content may live in the components step.\n(If omitted sections were just skipped, don\'t penalize them if you know it\'s a guided flow.)'
)

code = code.replace(
    'section: x.section as string,',
    'section: x.section as string,\n          key: (["requirements", "estimates", "api", "dataModel", "components", "tradeoffs"].includes(x?.key) ? x.key : "components"),'
)

code = code.replace(
    'return { rubric_evaluation, sections, next_time: str(parsed?.next_time, 500, "Keep practising.") };',
    'const score = rubric_evaluation.reduce((s, p) => s + (p.status === "covered" ? 1 : p.status === "partial" ? 0.5 : 0), 0);\n  return {\n    rubric_evaluation,\n    sections,\n    next_time: str(parsed?.next_time, 500, "Keep practising."),\n    strongestPart: parsed?.strongestPart ? str(parsed.strongestPart, 500) : null,\n    highestLeverageGap: parsed?.highestLeverageGap ? str(parsed.highestLeverageGap, 500) : null,\n    score\n  };'
)

with open('server/src/llm.ts', 'w', encoding='utf-8') as f:
    f.write(code)
