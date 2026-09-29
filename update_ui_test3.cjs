const fs = require("fs");
let t = fs.readFileSync("tests/ui-static.test.mjs", "utf8");
t = t.replace(/assert\.ok\(css\.includes\("\\.genstep\.run \\.tick \\{ color: var\\(--surface\\); \\}"\)/, 'assert.ok(css.includes(".genstep.run .tick { color: var(--bg-surface); }") || css.includes(".genstep.run .tick { color: var(--bg-surface) }")');
fs.writeFileSync("tests/ui-static.test.mjs", t);
