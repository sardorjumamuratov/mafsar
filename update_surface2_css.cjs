const fs = require("fs");
let css = fs.readFileSync("src/ui/panel.css", "utf8");
css = css.replace(/--surface-2/g, "--bg-surface2");
fs.writeFileSync("src/ui/panel.css", css);
