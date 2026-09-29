const fs = require("fs");
let c = fs.readFileSync("src/ui/views/sets.js", "utf8");
c = c.replace(/import \{ cleanTitle \} from "\.\.\/\.\.\/shared\/titles\.js";/, 'import { cleanTitle } from "../../../shared/titles.js";');
fs.writeFileSync("src/ui/views/sets.js", c);
