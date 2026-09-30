const fs = require("fs");
let sets = fs.readFileSync("src/ui/views/sets.js", "utf8");
sets = sets.replace(/<button class="btn btn-ghost".*data-action="open-import".*<\/button>/, '');
fs.writeFileSync("src/ui/views/sets.js", sets);
