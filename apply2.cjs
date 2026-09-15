
const fs = require("fs");
const blocks = require("./extracted.json");

// 1d: ui-static.test.mjs
let uistatic = fs.readFileSync("tests/ui-static.test.mjs", "utf8");
uistatic = uistatic.replace("console.log(`\\n${passed} tests passed`);", blocks["tests/ui-static.test.mjs"][0].trim() + "\n\nconsole.log(`\\n${passed} tests passed`);");
fs.writeFileSync("tests/ui-static.test.mjs", uistatic);

// 2a: billing/core.ts
let billing = fs.readFileSync("server/src/billing/core.ts", "utf8");
billing = billing.replace("export async function refundQuota", blocks["server/src/billing/core.ts"][0].trim() + "\n\nexport async function refundQuota");
fs.writeFileSync("server/src/billing/core.ts", billing);

// 2b: schema.ts
let schema = fs.readFileSync("server/src/schema.ts", "utf8");
schema += "\n\n" + blocks["server/src/schema.ts"][0].trim() + "\n";
fs.writeFileSync("server/src/schema.ts", schema);

// 2c: llm.ts
let llm = fs.readFileSync("server/src/llm.ts", "utf8");
llm = llm.replace("async function callJson", "export async function callJson");
fs.writeFileSync("server/src/llm.ts", llm);

// 2d: teach.ts
fs.writeFileSync("server/src/teach.ts", blocks["server/src/teach.ts"][0].trim() + "\n");

// 2e: app.ts
let app = fs.readFileSync("server/src/app.ts", "utf8");
app = app.replace("import { consumeQuota } from \"./billing/index.js\";", "import { consumeQuota, refundQuota } from \"./billing/index.js\";");
app = app.replace("import { registerSchema, loginSchema, pollSchema, generateSchema, reviewGradeSchema, hypotheticalSchema, summarySchema, blurbSchema, codingTaskSchema, codingGradeSchema } from \"./schema.js\";", "import { registerSchema, loginSchema, pollSchema, generateSchema, reviewGradeSchema, hypotheticalSchema, summarySchema, blurbSchema, codingTaskSchema, codingGradeSchema, teachTurnSchema, teachEvaluateSchema } from \"./schema.js\";");
app = app.replace("import { generateCodingTask, gradeCode } from \"./llm.js\";", "import { generateCodingTask, gradeCode } from \"./llm.js\";\n" + blocks["server/src/app.ts"][0].trim());
app = app.replace("  // --- Phase 3: analytics - TODO ---", blocks["server/src/app.ts"][1].trim() + "\n\n  // --- Phase 3: analytics - TODO ---");
fs.writeFileSync("server/src/app.ts", app);

// 2f: privacy.ts
let privacy = fs.readFileSync("server/src/privacy.ts", "utf8");
privacy = privacy.replace("<h2>Where data is stored</h2>", blocks["server/src/privacy.ts"][0].trim() + "\n\n<h2>Where data is stored</h2>");
fs.writeFileSync("server/src/privacy.ts", privacy);

console.log("Server step 2 done");

