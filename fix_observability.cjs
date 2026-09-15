const fs = require("fs");
const cp = require("child_process");

const md = cp.execSync("git show feat/mobile-app:docs/prompts/06-error-reporting.md", { encoding: "utf8" });
const lines = md.split("\n");

let inBlock = false;
let currentFile = "";
let content = "";

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.startsWith("### 2b.")) { currentFile = "server/src/observability.ts"; }
  else if (line.startsWith("### 2c.")) { currentFile = ""; }
  else if (line.startsWith("```ts") && currentFile) {
    if (!inBlock) {
      inBlock = true;
      content = "";
    }
  } else if (line.startsWith("```") && inBlock) {
    fs.writeFileSync(currentFile, content);
    console.log("Wrote " + currentFile);
    inBlock = false;
    currentFile = "";
  } else if (inBlock) {
    content += line + "\n";
  }
}

