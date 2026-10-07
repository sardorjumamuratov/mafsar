import fs from "fs";
let code = fs.readFileSync("server/src/llm.ts", "utf8");

code = code.replace(
  '{ "brief": string, "rubric": [string] }`;',
  '{ "brief": string, "rubric": [string], "constraints": [string] }\nconstraints is an array of 2-4 very short constraint phrases (e.g. "5k writes/s", "reads 100x writes").`;'
);

code = code.replace(
  'const rubric = strList(parsed?.rubric, 10, 500);',
  'const rubric = strList(parsed?.rubric, 10, 500);\n  const constraints = strList(parsed?.constraints, 4, 100);'
);

code = code.replace(
  'return { brief, rubric };',
  'return { brief, rubric, constraints };'
);

fs.writeFileSync("server/src/llm.ts", code, "utf8");
