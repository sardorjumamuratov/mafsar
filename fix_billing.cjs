
const fs = require("fs");
let content = fs.readFileSync("server/src/billing/core.ts", "utf8");
const blocks = require("./extracted.json");

const startIdx = content.indexOf(`export function requireQuota`);
content = content.slice(0, startIdx) + blocks["server/src/billing/core.ts"][0].trim() + "\n";
fs.writeFileSync("server/src/billing/core.ts", content);

