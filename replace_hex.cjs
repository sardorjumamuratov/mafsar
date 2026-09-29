const fs = require("fs");
let css = fs.readFileSync("src/ui/panel.css", "utf8");
// replace the hardcoded hexes in my components
css = css.replace(/#27322f/g, "var(--border-control)");
// replace in original code
css = css.replace(/#fff/ig, "var(--bg-surface)");
css = css.replace(/#ffffff/ig, "var(--bg-surface)");
css = css.replace(/#f1faf9/ig, "var(--accent-chip-bg)");
css = css.replace(/#35b7b4/ig, "var(--accent)");
css = css.replace(/#141d1b/ig, "var(--bg-surface)");
fs.writeFileSync("src/ui/panel.css", css);
