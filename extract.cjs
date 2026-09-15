const fs = require("fs");
const cp = require("child_process");

const md = cp.execSync("git show feat/mobile-app:docs/prompts/08-teach-it-back.md", { encoding: "utf8" });
const lines = md.split(/\r?\n/);

let inBlock = false;
let currentFile = "";
let content = "";
const blocks = {};

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  if (line.match(/^### \d+[a-z]\. /) || line.match(/^## Step /)) {
    const m = line.match(/`([^`]+)`/);
    if (m) {
      currentFile = m[1];
    } else {
      currentFile = "";
    }
  }

  if (line.startsWith("```") && !inBlock) {
    const lang = line.slice(3).trim();
    if (["js", "ts", "css", "html", "json", "bash"].includes(lang) && currentFile) {
       inBlock = true;
       content = "";
    }
  } else if (line.startsWith("```") && inBlock) {
    if (!blocks[currentFile]) blocks[currentFile] = [];
    blocks[currentFile].push(content);
    inBlock = false;
  } else if (inBlock) {
    content += line + "\n";
  }
}

for (const [file, contents] of Object.entries(blocks)) {
  console.log(`Extracted ${contents.length} blocks for ${file}`);
}
fs.writeFileSync("extracted.json", JSON.stringify(blocks, null, 2));

