const fs = require("fs");
let c = fs.readFileSync("src/ui/views/sets.js", "utf8");
c = c.replace(/calc\(28px \+ var\(--dock-height, 0px\)\)/g, '28px');
fs.writeFileSync("src/ui/views/sets.js", c);
