const fs = require('fs');
let code = fs.readFileSync('server/src/llm.ts', 'utf8');

code = code.replace(
  /export async function generateDesignTask\(concept: string, reference: Ref\[\], mode\?: string\) \{/,
  'export async function generateDesignTask(concept: string, reference: Ref[], mode?: string, uid?: string) {'
);
code = code.replace(
  /return \{ brief, rubric, state: encryptState\(secret\) \};/,
  'return { brief, rubric, state: encryptState({ ...secret, uid, iat: Date.now() }) };'
);

code = code.replace(
  /export async function gradeDesignAnswer\(input: \{/,
  'export async function gradeDesignAnswer(input: {\n  uid?: string;'
);
code = code.replace(
  /const parsed = decryptState\(input\.state\);/,
  'const parsed = openState<any>(input.state, "requirements", input.uid);'
);

code = code.replace(
  /export async function generateBottleneckTask\(concept: string, reference: Ref\[\]\) \{/,
  'export async function generateBottleneckTask(concept: string, reference: Ref[], uid?: string) {'
);
code = code.replace(
  /return \{ narrative, architecture, state: encryptState\(secret\) \};/,
  'return { narrative, architecture, state: encryptState({ ...secret, uid, iat: Date.now() }) };'
);

code = code.replace(
  /export async function generateBottleneckHint\(state: string\) \{/,
  'export async function generateBottleneckHint(state: string, uid?: string) {'
);
code = code.replace(
  /const s = openState\<BottleneckState\>\(state, "planted_flaw"\);/,
  'const s = openState<BottleneckState>(state, "planted_flaw", uid);'
);

code = code.replace(
  /export async function gradeBottleneckAnswer\(state: string, answer: string, usedHint = false\) \{/,
  'export async function gradeBottleneckAnswer(state: string, answer: string, usedHint = false, uid?: string) {'
);
code = code.replace(
  /const s = openState\<BottleneckState\>\(state, "planted_flaw"\);/,
  'const s = openState<BottleneckState>(state, "planted_flaw", uid);'
);

fs.writeFileSync('server/src/llm.ts', code);
