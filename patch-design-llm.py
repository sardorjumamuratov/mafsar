import os

with open('server/src/llm.ts', 'r', encoding='utf-8') as f:
    code = f.read()

code = code.replace(
    "export async function generateDesignTask(concept: string, reference: Ref[], mode?: string, uid?: string) {",
    "export async function generateDesignTask(concept: string, reference: Ref[], mode?: string, uid?: string, practiceStyle?: string) {"
)
code = code.replace(
    "return { brief, rubric, state: encryptState({ ...secret, uid, iat: Date.now() }) };",
    "return { brief, rubric, state: encryptState({ ...secret, uid, iat: Date.now(), practiceStyle }) };"
)

with open('server/src/llm.ts', 'w', encoding='utf-8') as f:
    f.write(code)
