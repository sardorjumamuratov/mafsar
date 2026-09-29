const fs = require("fs");
let css = fs.readFileSync("src/ui/panel.css", "utf8");

const tokensLight = `
  --bg-app: #f5f8f7;
  --bg-nav: #ffffff;
  --bg-surface: #ffffff;
  --bg-surface2: #edf2f0;
  --bg-sheet: #ffffff;
  --bg-segment-active: #e2eae7;
  --border-control: #d3ddd9;
  --border-card: #dfe7e4;
  --border-divider: #e6ecea;
  --border-hover: #8fcac2;
  --text-primary: #0e1513;
  --text-secondary: #26332f;
  --text-answer: #3a4845;
  --text-body2: #4b5a56;
  --text-muted: #5b6b67;
  --text-faint: #6f7f7b;
  --accent: #34bcad;
  --accent-hover: #2fae9f;
  --accent-on: #04211d;
  --accent-text: #11766b;
  --accent-dot: #1f9d8f;
  --accent-chip-bg: #daf3ef;
  --accent-on-white: #16786e;
  --accent-pressed: #2aa396;
  --status-new: #8a9894;
  --status-new-bar: #cfd8d5;
  --status-learning: #e3a246;
  --status-learning-text: #a8660d;
  --status-mastered: #2f9e63;
  --danger-text: #c2412f;
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

css = css.replace(/:root\s*\{[^}]*\}/, `:root {
${tokensLight}
  --shadow: 0 1px 2px rgba(20, 32, 30, 0.05), 0 14px 34px -18px rgba(20, 32, 30, 0.22);
  --shadow-sm: 0 1px 2px rgba(20, 32, 30, 0.06);
  --serif: ui-serif, "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  --r-lg: 16px;
  --r-md: 12px;
  --r-sm: 9px;
}`);

css = css.replace(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{[^{]*:root\s*\{[^}]*\}\s*\}/, `@media (prefers-color-scheme: dark) {
  :root {
${tokensDark}
  }
}`);

// Font definitions
css = `@font-face { font-family: "Geist"; src: url("../vendor/geist/Geist[wght].woff2") format("woff2"); font-weight: 100 900; font-display: block; }\n` + css;

css = css.replace(/body\s*\{([^}]*)\}/, (match, bodyContent) => {
  return `body {${bodyContent.replace(/font-family: [^;]+;/, 'font-family: "Geist", system-ui, sans-serif;')}}`;
});

// Update global focus and scrollbar as per README
css += `
:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 2px; }
* { scrollbar-width: thin; scrollbar-color: var(--border-control) transparent; }
`;

fs.writeFileSync("src/ui/panel.css", css);

const html = fs.readFileSync("src/ui/panel.html", "utf8");
fs.writeFileSync("src/ui/panel.html", html.replace(/<link rel="stylesheet" href="panel\.css"\s*\/>/, `<link rel="preload" as="font" type="font/woff2" href="../vendor/geist/Geist[wght].woff2" crossorigin>\n  <link rel="stylesheet" href="panel.css" />`));
