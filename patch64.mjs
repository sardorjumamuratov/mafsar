import fs from "fs";
let code = fs.readFileSync("src/ui/flows/bottleneck.js", "utf8");

code = code.replace(
  'draft: "",',
  'draft: "",\n    draft2: "",\n    draft3: "",\n    guidedStep: 1,\n    selectedComponentIdx: -1,\n    selectedComponentId: null,\n    hints: [],\n    hintLevel: 0,'
);

fs.writeFileSync("src/ui/flows/bottleneck.js", code, "utf8");
