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
  code = code.replace(/--text-primary/g, "--ink");
  code = code.replace(/--text-secondary/g, "--muted");
  code = code.replace(/--text-muted/g, "--muted");
  code = code.replace(/--text-faint/g, "--faint");
  code = code.replace(/--bg-surface2/g, "--surface-2");
  code = code.replace(/--bg-surface/g, "--surface");
  code = code.replace(/--bg-sheet/g, "--surface");
  code = code.replace(/--border-card/g, "--border");
  code = code.replace(/--border-hover/g, "--primary");
  code = code.replace(/--border-divider/g, "--border");
  code = code.replace(/--border-control/g, "--border");
  code = code.replace(/--accent-text/g, "--primary");
  code = code.replace(/--accent/g, "--primary");
  code = code.replace(/--chart-zero/g, "--surface-2");
  code = code.replace(/--chart-bar/g, "--primary");
  code = code.replace(/--status-new/g, "--faint");
  code = code.replace(/--status-learning/g, "--warm");
  code = code.replace(/--status-due/g, "--danger");
  code = code.replace(/--status-mastered/g, "--success");
  code = code.replace(/--rating-star/g, "--warm");
  code = code.replace(/--rating-empty/g, "--faint");
  fs.writeFileSync(f, code);
}
