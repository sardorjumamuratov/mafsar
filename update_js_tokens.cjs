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

const map = {
  "--bg": "--bg-app",
  "--surface": "--bg-surface",
  "--surface-2": "--bg-surface2",
  "--border": "--border-control",
  "--ink": "--text-primary",
  "--muted": "--text-muted",
  "--faint": "--text-faint",
  "--primary": "--accent",
  "--primary-strong": "--accent-hover",
  "--primary-soft": "--accent-chip-bg",
  "--danger": "--danger-text",
  "--success": "--status-mastered",
  "--success-soft": "--bg-surface2",
  "--danger-soft": "--bg-surface2",
  "--warm": "--status-learning",
  "--warm-soft": "--status-new"
};

for (const f of walk("src/ui")) {
  let content = fs.readFileSync(f, "utf8");
  let changed = false;
  for (const [oldVar, newVar] of Object.entries(map)) {
    const regex = new RegExp(`var\\(${oldVar}\\)`, "g");
    if (regex.test(content)) {
      content = content.replace(regex, `var(${newVar})`);
      changed = true;
    }
  }
  if (changed) fs.writeFileSync(f, content);
}
