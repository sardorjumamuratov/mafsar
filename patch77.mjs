import fs from "fs";
let code = fs.readFileSync("src/ui/panel.js", "utf8");

code = code.replace(
  'case "estimation-dontknow": estimationAction("dontknow"); break;',
  'case "estimation-dontknow": estimationAction("dontknow"); break;\n    case "estimation-toggle-working": estimationAction("toggle-working"); break;\n    case "estimation-traffic-average": estimationAction("traffic-average"); break;\n    case "estimation-traffic-peak": estimationAction("traffic-peak"); break;'
);

fs.writeFileSync("src/ui/panel.js", code, "utf8");
