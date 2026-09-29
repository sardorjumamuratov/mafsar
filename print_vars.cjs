const { readFileSync } = require("fs");
const css = readFileSync("src/ui/panel.css", "utf8");
const vars = [...css.matchAll(/var\((--[a-z0-9-]+)\)/g)].map(m => m[1]);
console.log(new Set(vars));
