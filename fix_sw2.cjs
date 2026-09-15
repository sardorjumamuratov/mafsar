
const fs = require("fs");
let sw = fs.readFileSync("src/background/service-worker.js", "utf8");
sw = sw.replace("backendEvaluateTeaching,", "backendTeachEvaluate,");
fs.writeFileSync("src/background/service-worker.js", sw);

