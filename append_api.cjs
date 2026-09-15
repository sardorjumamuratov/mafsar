
const fs = require("fs");
const blocks = require("./extracted.json");
let api = fs.readFileSync("src/sync/api.js", "utf8");
api += "\n\n" + blocks["src/sync/api.js"][0].trim() + "\n";
fs.writeFileSync("src/sync/api.js", api);

