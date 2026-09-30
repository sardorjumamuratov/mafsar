const fs = require("fs");
let stats = fs.readFileSync("src/ui/views/stats.js", "utf8");
stats = stats.replace('import { app, setHTML, esc, toast, send, bundle } from "../core.js";', 'import { app, setHTML, esc, toast, send, bundle, topOfView } from "../core.js";\nimport { setNav, showChrome } from "../nav.js";');
stats = stats.replace('export async function renderStats() {', 'export async function renderStats() {\n  setNav("stats");\n  showChrome(true);\n  topOfView();');
fs.writeFileSync("src/ui/views/stats.js", stats);
