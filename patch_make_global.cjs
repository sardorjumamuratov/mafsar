const fs = require("fs");
let code = fs.readFileSync("src/ui/views/set-detail.js", "utf8");
code = code.replace('Publish (needs sign-in)', 'Make it global (needs sign-in)');
fs.writeFileSync("src/ui/views/set-detail.js", code);
