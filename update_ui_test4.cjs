const fs = require("fs");
let t = fs.readFileSync("tests/ui-static.test.mjs", "utf8");
t = t.replace(/box\.includes\("box-shadow: inset 1em 1em var\(--surface\)"\)/, 'box.includes("box-shadow: inset 1em 1em var(--bg-surface)")');
fs.writeFileSync("tests/ui-static.test.mjs", t);
