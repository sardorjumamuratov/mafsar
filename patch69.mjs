import fs from "fs";
let code = fs.readFileSync("src/ui/flows/bottleneck.js", "utf8");

code = code.replace(
  '${rail(arch, failingIdx)}',
  '${rail(arch, failingIdx, s.selectedComponentIdx, false)}'
);

fs.writeFileSync("src/ui/flows/bottleneck.js", code, "utf8");
