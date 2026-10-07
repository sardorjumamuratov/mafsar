const fs = require('fs');
let code = fs.readFileSync('server/src/llm.ts', 'utf8');

code = code.replace(
  /task: string; answer: string; rubric\?: string\[\];/,
  'task: string; answer: string | Record<string, string>; rubric?: string[];'
);

code = code.replace(
  /export async function gradeDesignAnswer\(input: \{[\s\S]*?\}\) \{/,
  $&
  let answerStr = input.answer;
  if (typeof answerStr !== "string") {
    answerStr = Object.entries(answerStr)
      .filter(([_, v]) => v.trim().length > 0)
      .map(([k, v]) => k.toUpperCase() + ":\\n" + v)
      .join("\\n\\n");
    if (!answerStr) answerStr = "(Skipped all sections)";
  }

);

// We need to replace input.answer with answerStr down below where it's used
code = code.replace(
  /Student's answer:\\n\$\{input\.answer\}/g,
  'Student\\'s answer:\\n'
);
code = code.replace(
  /Learner's answer to the curveball:\\n\$\{input\.answer\}/g,
  'Learner\\'s answer to the curveball:\\n'
);

fs.writeFileSync('server/src/llm.ts', code);
