import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
const md = execSync("git show feat/mobile-app:docs/prompts/05-account-deletion.md").toString();
let inBlock = false;
let blockContent = "";
let currentFile = "";
for (const line of md.split(/\r?\n/)) {
  if (line.startsWith("### 1a.")) currentFile = "server/tests/account.test.ts";
  else if (line.startsWith("### 1b.")) currentFile = "tests/account.test.mjs";
  else if (line.startsWith("```ts") || line.startsWith("```js")) {
    if (currentFile) inBlock = true;
  }
  else if (line.startsWith("```") && inBlock) {
    writeFileSync(currentFile, blockContent);
    inBlock = false;
    blockContent = "";
    currentFile = "";
  }
  else if (inBlock) blockContent += line + "\n";
}

