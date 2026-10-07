import fs from "fs";

let dCode = fs.readFileSync("src/ui/flows/design.js", "utf8");
dCode = dCode.replace("bindField, focusEnd, icon, paintShell", "bindField, feedbackSummary, focusEnd, icon, paintShell");
fs.writeFileSync("src/ui/flows/design.js", dCode, "utf8");

let eCode = fs.readFileSync("src/ui/flows/estimation.js", "utf8");
eCode = eCode.replace("bindField, focusEnd, paintShell", "bindField, feedbackSummary, focusEnd, paintShell");
fs.writeFileSync("src/ui/flows/estimation.js", eCode, "utf8");
