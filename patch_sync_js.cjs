const fs = require("fs");
let syncCode = fs.readFileSync("src/sync/sync.js", "utf8");

syncCode = syncCode.replace('import { getAuth } from "./auth.js";', 'import { getAuth } from "./auth.js";\nimport { flushPendingRatings } from "../storage/ratings.js";');
syncCode = syncCode.replace('const serverNow = res.headers.get("x-server-now");', 'const serverNow = res.headers.get("x-server-now");\n    flushPendingRatings();');

fs.writeFileSync("src/sync/sync.js", syncCode);
