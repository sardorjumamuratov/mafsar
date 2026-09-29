const fs = require("fs");
let css = fs.readFileSync("src/ui/panel.css", "utf8");
css = css.replace(/\.view:not\(:has\(\.bottom-nav\)\) ~ #toast \{ bottom: 16px; \}/, `
#toast { bottom: 16px; }
#bottomNav:not(.hidden) ~ #toast { bottom: 78px; }
#captureDock:not(.hidden) ~ #bottomNav:not(.hidden) ~ #toast { bottom: 138px; }
`);
fs.writeFileSync("src/ui/panel.css", css);
