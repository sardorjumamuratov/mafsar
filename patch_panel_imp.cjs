const fs = require("fs");
let panel = fs.readFileSync("src/ui/panel.js", "utf8");

const importLine = 'import { rateSet, clearRating } from "../storage/ratings.js";';
if (!panel.includes(importLine)) {
  panel = panel.replace('import { renderStats } from "./views/stats.js";', 'import { renderStats } from "./views/stats.js";\n' + importLine);
}
fs.writeFileSync("src/ui/panel.js", panel);
