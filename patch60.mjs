import fs from "fs";
let code = fs.readFileSync("src/ui/flows/shell.js", "utf8");

code = code.replace("import { send, toast } from \"../core.js\";\nimport { openSheet, closeSheet } from \"../sheet.js\";\nimport { addCard } from \"../../storage/store.js\";\nimport { isDuplicate } from \"../../storage/card-dedupe.js\";\n", "");

fs.writeFileSync("src/ui/flows/shell.js", code, "utf8");
