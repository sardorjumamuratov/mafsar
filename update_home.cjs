const fs = require("fs");
let h = fs.readFileSync("src/ui/views/home.js", "utf8");
h = h.replace(/import \{ SetRow as setRow \} from "\.\.\/set-row\.js";/, 'import { SetRowHtml as setRow } from "../set-row.js";');
fs.writeFileSync("src/ui/views/home.js", h);
