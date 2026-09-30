const fs = require("fs");
let panel = fs.readFileSync("src/ui/panel.js", "utf8");

const importLine = 'import { reportGlobal, previewGlobal, openAdded, addGlobal, unpublishGlobal, publishGlobal, setGlobalTab } from "./views/global.js";';
if (!panel.includes('previewGlobal')) {
  panel = panel.replace('import { renderGlobal } from "./views/global.js";', 'import { renderGlobal, reportGlobal, previewGlobal, openAdded, addGlobal, unpublishGlobal, publishGlobal, setGlobalTab } from "./views/global.js";');
}

const handlers = `
  if (act === "global-tab") return setGlobalTab(t.dataset.tab);
  if (act === "global-preview") return previewGlobal(id);
  if (act === "global-open-added") return openAdded(id);
  if (act === "global-add-set") return addGlobal(id);
  if (act === "global-report") return reportGlobal(id);
  if (act === "global-unpublish") return unpublishGlobal(id);
  if (act === "global-publish") return publishGlobal(id);
`;
if (!panel.includes('global-preview')) {
  panel = panel.replace('if (act === "export-backup") return exportBackup();', 'if (act === "export-backup") return exportBackup();\n' + handlers);
}

fs.writeFileSync("src/ui/panel.js", panel);

let ratings = fs.readFileSync("src/storage/ratings.js", "utf8");
ratings = ratings.replace('if (typeof window !== "undefined") window.addEventListener("online", flushPendingRatings);', 'if (typeof window !== "undefined" && window.addEventListener) window.addEventListener("online", flushPendingRatings);');
fs.writeFileSync("src/storage/ratings.js", ratings);

