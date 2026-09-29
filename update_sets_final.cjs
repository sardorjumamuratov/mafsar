const fs = require("fs");
let c = fs.readFileSync("src/ui/views/sets.js", "utf8");

c = c.replace(/import \{ SectionLabel, PrimaryButton, IconButton \} from "\.\.\/components\.js";\r?\nimport \{ SetRow \} from "\.\.\/set-row\.js";\r?\nimport \{ BottomSheet \} from "\.\.\/sheet\.js";/, `import { SectionLabel, PrimaryButton, IconButton } from "../components.js";
import { SetRowHtml as SetRow } from "../set-row.js";
import { openSheet, closeSheet } from "../sheet.js";`);

fs.writeFileSync("src/ui/views/sets.js", c);
