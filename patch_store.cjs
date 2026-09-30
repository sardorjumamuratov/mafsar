const fs = require("fs");
let storeCode = fs.readFileSync("src/storage/store.js", "utf8");

// Load ratings on boot
storeCode = storeCode.replace('import { activeAccount } from "../sync/auth.js";', 'import { activeAccount } from "../sync/auth.js";\nimport { loadRatingsStore, flushPendingRatings } from "./ratings.js";');
storeCode = storeCode.replace('if (accounts[activeAccount]) {', 'if (accounts[activeAccount]) {\n    await loadRatingsStore();\n    flushPendingRatings();');

fs.writeFileSync("src/storage/store.js", storeCode);
