
const fs = require("fs");
const blocks = require("./extracted.json");
let sw = fs.readFileSync("src/background/service-worker.js", "utf8");

const idx = sw.indexOf(`    case "DELETE_ACCOUNT": {`);
sw = sw.slice(0, idx) + blocks["src/background/service-worker.js"][0].trim() + "\n\n" + sw.slice(idx);

fs.writeFileSync("src/background/service-worker.js", sw);

