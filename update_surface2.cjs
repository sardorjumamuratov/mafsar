const fs = require("fs");
const path = require("path");

function walk(dir) {
  let files = [];
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) files = files.concat(walk(p));
    else if (p.endsWith(".js")) files.push(p);
  }
  return files;
}

for (const f of walk("src/ui")) {
  let content = fs.readFileSync(f, "utf8");
  if (content.includes("--surface-2")) {
    content = content.replace(/--surface-2/g, "--bg-surface2");
    fs.writeFileSync(f, content);
  }
}
