
const fs = require("fs");
let content = fs.readFileSync("server/src/app.ts", "utf8");
const blocks = require("./extracted.json");

// Import teach schema
content = content.replace("codingGradeSchema, shareCreateSchema", "teachTurnSchema, teachEvaluateSchema, codingGradeSchema, shareCreateSchema");

// Import teach functions
const teachImportStr = blocks["server/src/app.ts"][0].trim();
content = content.replace("import { PRIVACY_HTML", teachImportStr + "\nimport { PRIVACY_HTML");

// Import refundQuota
content = content.replace("requireQuota, usageSummary", "consumeQuota, refundQuota, requireQuota, usageSummary");

// Routes
const teachRoutesStr = blocks["server/src/app.ts"][1].trim();
const insertTarget = "  // --- Phase 3: analytics";
content = content.replace(insertTarget, teachRoutesStr + "\n\n" + insertTarget);

fs.writeFileSync("server/src/app.ts", content);

