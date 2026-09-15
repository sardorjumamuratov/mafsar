
const fs = require("fs");
const blocks = require("./extracted.json");
let panel = fs.readFileSync("src/ui/panel.js", "utf8");

panel = panel.replace(`import { startCodingPractice }`, blocks["src/ui/panel.js"][0].trim() + `\nimport { startCodingPractice }`);

panel = panel.replace(
  `    case "start-coding": startCodingPractice(id); break;`,
  `    case "start-coding": startCodingPractice(id); break;\n` + blocks["src/ui/panel.js"][1].trim()
);

fs.writeFileSync("src/ui/panel.js", panel);

