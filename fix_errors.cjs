const fs = require("fs");

let p = fs.readFileSync("src/ui/panel.js", "utf8");
p = 'import { renderDiscover, renderStats } from "./views/discover-stats.js";\n' + p;
fs.writeFileSync("src/ui/panel.js", p);

let ds = fs.readFileSync("src/ui/views/discover-stats.js", "utf8");
ds = ds.replace(/import { setHTML, app, esc, setViewName } from "\.\.\/core\.js";/, 'import { setHTML, app, esc } from "../core.js";');
ds = ds.replace(/import { setNavTab } from "\.\.\/nav\.js";/, 'import { setNav } from "../nav.js";');
ds = ds.replace(/setViewName\([^)]*\);\s*/g, "");
ds = ds.replace(/setNavTab\(/g, "setNav(");
fs.writeFileSync("src/ui/views/discover-stats.js", ds);

let sh = fs.readFileSync("src/ui/sheet.js", "utf8");
sh = sh.replace(/focusable\[0\]\.focus\(\);/, "(/** @type {HTMLElement} */ (focusable[0])).focus();");
fs.writeFileSync("src/ui/sheet.js", sh);
