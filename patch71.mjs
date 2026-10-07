import fs from "fs";
let code = fs.readFileSync("src/ui/flows/bottleneck.js", "utf8");

code = code.replace(
  /const s = bottleneckState;\r?\n  if \(\!s\) return;\r?\n  if \(action === "continue"\) \{/g,
  'if (action === "continue") {'
);

code = code.replace(
  /\/\*\*[\s\S]*?function rail\(/g,
  'function rail('
);

fs.writeFileSync("src/ui/flows/bottleneck.js", code, "utf8");
