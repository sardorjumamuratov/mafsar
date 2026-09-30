const fs = require("fs");
let appCode = fs.readFileSync("server/src/app.ts", "utf8");
appCode = appCode.replace('import { createDiscoverApp } from "./discover.js";', 'import { createDiscoverApp } from "./discover.js";\nimport { createRatingsApp } from "./ratings.js";');
appCode = appCode.replace('app.route("/v1", createDiscoverApp(db));', 'app.route("/v1", createDiscoverApp(db));\n  app.route("/", createRatingsApp(db));');
fs.writeFileSync("server/src/app.ts", appCode);
