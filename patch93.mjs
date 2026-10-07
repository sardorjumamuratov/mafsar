import fs from "fs";
let code = fs.readFileSync("server/src/llm.ts", "utf8");

code = code.replace(
  'They have written a draft for one section of the design (${step}).',
  'They have written a draft for one section of the design (\\${step}).'
);

fs.writeFileSync("server/src/llm.ts", code, "utf8");
