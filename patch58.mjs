import fs from "fs";
let code = fs.readFileSync("src/ui/flows/shell.js", "utf8");
code = code.replace("import { app, esc, setHTML, send, toast, send, toast }", "import { app, esc, setHTML, send, toast }");
fs.writeFileSync("src/ui/flows/shell.js", code, "utf8");
