const fs = require('fs');
let code = fs.readFileSync('server/src/llm.ts', 'utf8');

code = code.replace(
  /export async function gradeDesignAnswer\(input: \{\n\s*uid\?: string;\n\s*task: string; answer: string;/g,
  'export async function gradeDesignAnswer(input: {\\n  uid?: string;\\n  task: string; answer: string | Record<string, string>;'
);

code = code.replace(
  /const state = openState\<ClinicalState\>\(input\.state, "diagnosis"\);/g,
  'const state = openState<ClinicalState>(input.state, "diagnosis", input.uid);'
);

code = code.replace(
  /export async function gradeDesignAnswer\(input: \{[\s\S]*?\}\) \{/g,
  $&
  let answerStr = input.answer;
  if (typeof answerStr !== "string") {
    answerStr = Object.entries(answerStr)
      .filter(([_, v]) => typeof v === "string" && v.trim().length > 0)
      .map(([k, v]) => k.toUpperCase() + ":\\n" + v)
      .join("\\n\\n");
    if (!answerStr) answerStr = "(Skipped all sections)";
  }

);

code = code.replace(
  /Student's answer:\\n\$\{input\.answer\}/g,
  'Student\\'s answer:\\n'
);

code = code.replace(
  /Learner's answer to the curveball:\\n\$\{input\.answer\}/g,
  'Learner\\'s answer to the curveball:\\n'
);

code = code.replace(
  /Original answer:\\n\$\{input\.originalAnswer\}/g,
  'Original answer:\\n'
);

fs.writeFileSync('server/src/llm.ts', code);
