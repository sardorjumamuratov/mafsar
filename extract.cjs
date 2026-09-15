
const fs = require("fs");
const cp = require("child_process");

const md = cp.execSync("git show feat/mobile-app:docs/prompts/05-account-deletion.md", { encoding: "utf8" });
const lines = md.split("\n");

let inBlock = false;
let currentFile = "";
let content = "";

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.startsWith("### 1a.")) { currentFile = "server/tests/account.test.ts"; }
  else if (line.startsWith("### 1b.")) { currentFile = "tests/account.test.mjs"; }
  else if (line.startsWith("```ts") || line.startsWith("```js") || line.startsWith("```css") || line.startsWith("```html")) {
    if (currentFile && !inBlock) {
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

