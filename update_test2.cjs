const fs = require("fs");
let m = fs.readFileSync("server/tests/migrations.test.ts", "utf8");
m = m.replace(/"51e0f0e615230e98", \/\/ 016 sets.chain_overrides\n\]/, '"51e0f0e615230e98", // 016 sets.chain_overrides\n  "25dcb3f149827527", // 017 sets.description\n]');
fs.writeFileSync("server/tests/migrations.test.ts", m);
