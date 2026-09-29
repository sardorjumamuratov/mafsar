const fs = require("fs");
let css = fs.readFileSync("src/ui/panel.css", "utf8");
const withoutThemes = css.replace(/:root\s*\{[^}]*\}/g, "").replace(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{[^{]*:root\s*\{[^}]*\}\s*\}/g, "");
const hexes = withoutThemes.match(/#([0-9a-fA-F]{3}){1,2}\b/g) || [];
console.log([...new Set(hexes)]);
