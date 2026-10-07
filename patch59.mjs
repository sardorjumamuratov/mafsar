import fs from "fs";
let code = fs.readFileSync("src/ui/flows/shell.js", "utf8");

code = code.replace(
  'const existingFronts = existingCards.map(c => c.front).slice(0, 50);',
  'const existingFronts = existingCards.map(c => c.front).slice(0, 50);\n  gaps = gaps.slice(0, 8);'
);

fs.writeFileSync("src/ui/flows/shell.js", code, "utf8");
