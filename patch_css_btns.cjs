const fs = require("fs");
let css = fs.readFileSync("src/ui/panel.css", "utf8");
if (!css.includes(".btn-outline")) {
  css += "\n.btn-outline { border: 1px solid var(--border); background: transparent; color: var(--ink); }\n";
}
if (!css.includes(".btn-text")) {
  css += "\n.btn-text { border: none; background: transparent; color: var(--muted); }\n";
}
fs.writeFileSync("src/ui/panel.css", css);
