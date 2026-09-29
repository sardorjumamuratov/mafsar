const fs = require("fs");
let t = fs.readFileSync("tests/redesign.test.mjs", "utf8");
t = t.replace(/assert\.ok\(panelJs\.includes\('nav-home'\)/, "assert.ok(panelJs.includes('\"home\"')");
t = t.replace(/assert\.ok\(panelJs\.includes\('nav-sets'\)/, "assert.ok(panelJs.includes('\"sets\"')");
t = t.replace(/assert\.ok\(panelJs\.includes\('nav-discover'\)/, "assert.ok(panelJs.includes('\"discover\"')");
t = t.replace(/assert\.ok\(panelJs\.includes\('nav-stats'\)/, "assert.ok(panelJs.includes('\"stats\"')");
t = t.replace(/assert\.ok\(panelJs\.includes\('nav-you'\)/, "assert.ok(panelJs.includes('\"you\"')");
fs.writeFileSync("tests/redesign.test.mjs", t);
