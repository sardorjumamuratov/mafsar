const fs = require("fs");
let css = fs.readFileSync("src/ui/panel.css", "utf8");

const tokensDark = `
  --bg-app: #0e1513;
  --bg-nav: #0b1110;
  --bg-surface: #141d1b;
  --bg-surface2: #1c2826;
  --bg-sheet: #151e1c;
  --bg-segment-active: #243230;
  --border-control: #27322f;
  --border-card: #222c2a;
  --border-divider: #1e2826;
  --border-hover: #34514c;
  --text-primary: #e7eeec;
  --text-secondary: #cfd9d6;
  --text-answer: #b9c6c2;
  --text-body2: #a9b6b2;
  --text-muted: #9aa9a4;
  --text-faint: #8b9a96;
  --accent: #34bcad;
  --accent-hover: #45cbbc;
  --accent-on: #04211d;
  --accent-text: #5fd3c5;
  --accent-dot: #3cc4b4;
  --accent-chip-bg: #133a35;
  --accent-on-white: #16786e;
  --accent-pressed: #2aa396;
  --status-new: #6d7c78;
  --status-new-bar: #3b4845;
  --status-learning: #e3a246;
  --status-learning-text: #e3a246;
  --status-mastered: #45c483;
  --danger-text: #f08a7a;
  --overlay: rgba(14,21,19,0.45);
  --toast-bg: #0e1513;
  --toast-text: #e7eeec;
  --toast-action: #5fd3c5;
  --rating-star: #e9b93a;
  --rating-empty: #a3b0ac;
  --chart-bar: #cfe3df;
  --chart-zero: #e6ecea;
  --src-ai-bg: #daf3ef;
  --src-ai-fg: #11766b;
  --src-yt-bg: #fbe3df;
  --src-yt-fg: #b3402e;
  --src-gpt-bg: #e9efed;
  --src-gpt-fg: #26332f;
  --src-q-bg: #e3e9fb;
  --src-q-fg: #3552b0;
`;

// Remove the old dark theme blocks
css = css.replace(/@media \(prefers-color-scheme: dark\) \{[\s\S]*?\}\s*\}\s*/, "");
css = css.replace(/:root\[data-theme="dark"\][\s\S]*?\}\s*/, "");
css = css.replace(/:root\[data-theme="light"\][\s\S]*?\}\s*/, "");

// Append the correct dark theme
css += `\n@media (prefers-color-scheme: dark) {\n  :root {\n${tokensDark}\n  }\n}\n`;

fs.writeFileSync("src/ui/panel.css", css);
