const fs = require("fs");
const blocks = require("./extracted.json");
fs.writeFileSync("server/tests/teach.test.ts", blocks["server/tests/teach.test.ts"][0]);
fs.writeFileSync("server/tests/teach-routes.test.ts", blocks["server/tests/teach-routes.test.ts"][0]);
fs.writeFileSync("tests/teach.test.mjs", blocks["tests/teach.test.mjs"][0]);
console.log("Wrote test files");

