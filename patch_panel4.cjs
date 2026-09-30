const fs = require("fs");
let p = fs.readFileSync("src/ui/panel.js", "utf8");

p = p.replace(
  'const btn = /** @type {HTMLElement} */ (e.target).closest(".star-btn");',
  'const btn = /** @type {HTMLButtonElement|null} */ (/** @type {HTMLElement} */ (e.target).closest(".star-btn"));'
);
p = p.replace(
  'const btn = /** @type {HTMLElement} */ (e.target).closest(".star-btn");',
  'const btn = /** @type {HTMLButtonElement|null} */ (/** @type {HTMLElement} */ (e.target).closest(".star-btn"));'
);
p = p.replace(
  'const group = t.closest(".rating-group");',
  'const group = /** @type {HTMLElement|null} */ (t.closest(".rating-group"));'
);

fs.writeFileSync("src/ui/panel.js", p);
