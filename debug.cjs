const fs = require("fs");
const sheet = fs.readFileSync("src/ui/sheet.js", "utf8");
console.log("has modal?", sheet.includes('aria-modal="true"'));
console.log("has Escape?", sheet.includes("Escape"));
