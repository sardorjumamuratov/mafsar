
const fs = require("fs");
const blocks = require("./extracted.json");
let billing = fs.readFileSync("server/src/billing/core.ts", "utf8");
billing = billing.replace("export function requireQuota", blocks["server/src/billing/core.ts"][0].trim() + "\n\nexport function requireQuota");
fs.writeFileSync("server/src/billing/core.ts", billing);

