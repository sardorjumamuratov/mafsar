const fs = require("fs");
let p = fs.readFileSync("src/ui/panel.js", "utf8");

p = p.replace(
  'const btn = e.target.closest(".star-btn");',
  'const btn = /** @type {HTMLElement} */ (e.target).closest(".star-btn");'
);
p = p.replace(
  'const btn = e.target.closest(".star-btn");',
  'const btn = /** @type {HTMLElement} */ (e.target).closest(".star-btn");'
);
p = p.replace(
  'if (e.target.classList.contains("star-btn")) {',
  'const t = /** @type {HTMLElement} */ (e.target);\n  if (t.classList && t.classList.contains("star-btn")) {'
);
p = p.replace(
  'const group = e.target.closest(".rating-group");',
  'const group = t.closest(".rating-group");'
);
p = p.replace(
  'let val = parseInt(e.target.dataset.val, 10);',
  'let val = parseInt(t.dataset.val, 10);'
);
p = p.replace(
  /window.addEventListener\("mafsar-ratings-changed", \(\) => {[\s\S]*?}\);/,
  `window.addEventListener("mafsar-ratings-changed", () => {
  const d = currentDetail();
  if (d) {
    renderSetDetail(d.session.id, d.tab);
  } else if (document.getElementById("home-view")) {
    renderHome();
  } else if (document.getElementById("sets-view")) {
    // We don't import renderSets here, maybe we can just reload or do nothing
    // if renderSets is not imported, let's just use nav button clicks
    const btn = document.querySelector('[data-action="nav-library"]');
    if (btn) /** @type {HTMLElement} */ (btn).click();
  } else if (document.getElementById("global-view")) {
    renderGlobal();
  }
});`
);

fs.writeFileSync("src/ui/panel.js", p);
