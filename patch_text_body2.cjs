const fs = require("fs");
const files = [
  "src/ui/views/stats.js",
  "src/ui/views/set-detail.js",
  "src/ui/views/global.js",
  "src/storage/ratings.js",
  "src/ui/panel.js",
  "src/ui/views/home.js",
  "src/ui/views/teams.js",
  "src/ui/views/you.js",
];

for (const f of files) {
  if (!fs.existsSync(f)) continue;
  let code = fs.readFileSync(f, "utf8");
  code = code.replace(/--text-body2/g, "--muted");
  fs.writeFileSync(f, code);
}
