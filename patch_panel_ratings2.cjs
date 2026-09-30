const fs = require("fs");
let panel = fs.readFileSync("src/ui/panel.js", "utf8");

panel = panel.replace('import { activeTab, setNav, showChrome } from "./nav.js";', 'import { activeTab, setNav, showChrome } from "./nav.js";\nimport { renderHome } from "./views/home.js";\nimport { renderSets } from "./views/sets.js";\nimport { renderGlobal } from "./views/global.js";\nimport { currentDetail, renderSetDetail } from "./views/set-detail.js";');

const redraw = `
window.addEventListener("mafsar-ratings-changed", () => {
  const d = currentDetail();
  if (d) {
    renderSetDetail(d.session.id, d.tab);
  } else if (activeTab === "home") {
    renderHome();
  } else if (activeTab === "sets") {
    renderSets();
  } else if (activeTab === "discover") {
    renderGlobal();
  }
});
`;

panel = panel + '\n' + redraw;
fs.writeFileSync("src/ui/panel.js", panel);
