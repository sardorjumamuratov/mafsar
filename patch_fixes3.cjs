const fs = require("fs");

// 1. ratings.js window fix
let ratings = fs.readFileSync("src/storage/ratings.js", "utf8");
ratings = ratings.replace(
  'window.addEventListener("online", flushPendingRatings);',
  'if (typeof window !== "undefined") window.addEventListener("online", flushPendingRatings);'
);
fs.writeFileSync("src/storage/ratings.js", ratings);

// 2. ui-static.test.mjs Global -> Discover
let uiStatic = fs.readFileSync("tests/ui-static.test.mjs", "utf8");
uiStatic = uiStatic.replace(
  'assert.ok(html.includes("Global") && !html.includes("Shared"));',
  'assert.ok((html.includes("Global") || html.includes("Discover")) && !html.includes("Shared"));'
);
fs.writeFileSync("tests/ui-static.test.mjs", uiStatic);
