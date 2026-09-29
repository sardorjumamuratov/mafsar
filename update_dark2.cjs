const fs = require("fs");
let css = fs.readFileSync("src/ui/panel.css", "utf8");

const extraTokens = `
  --shadow: 0 1px 2px rgba(0, 0, 0, 0.35), 0 18px 38px -20px rgba(0, 0, 0, 0.7);
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4);
  --serif: ui-serif, "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  --r-lg: 16px;
  --r-md: 12px;
  --r-sm: 9px;
`;

css = css.replace(/@media \(prefers-color-scheme: dark\) \{\n  :root \{/, `@media (prefers-color-scheme: dark) {\n  :root {\n${extraTokens}`);

fs.writeFileSync("src/ui/panel.css", css);
