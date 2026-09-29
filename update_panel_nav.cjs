const fs = require("fs");
let p = fs.readFileSync("src/ui/panel.js", "utf8");

const newNav = `if (n === "review") return startGlobalReview();
  if (n === "home") renderHome();
  else if (n === "sets") renderSets();
  else if (n === "discover") renderDiscover();
  else if (n === "stats") renderStats();
  else if (n === "you") renderYou();`;

p = p.replace(/if \(n === "review"\) return startGlobalReview\(\);\s*if \(n === "home"\) renderHome\(\);\s*else if \(n === "sets"\) renderSets\(\);\s*else if \(n === "teams"\) renderTeams\(\);\s*else if \(n === "you"\) renderYou\(\);/, newNav);

fs.writeFileSync("src/ui/panel.js", p);
