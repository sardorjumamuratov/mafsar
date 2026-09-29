const fs = require("fs");
let css = fs.readFileSync("src/ui/panel.css", "utf8");
css = css.replace(/var\(--success-soft\)/g, "var(--bg-surface2)");
css = css.replace(/var\(--danger-soft\)/g, "var(--bg-surface2)");
fs.writeFileSync("src/ui/panel.css", css);
