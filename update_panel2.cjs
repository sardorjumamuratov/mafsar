const fs = require("fs");
let p = fs.readFileSync("src/ui/panel.js", "utf8");
p = p.replace(/case "auth-signout":/, 'case "nav-teams": renderTeams(); break;\n    case "auth-signout":');
fs.writeFileSync("src/ui/panel.js", p);
