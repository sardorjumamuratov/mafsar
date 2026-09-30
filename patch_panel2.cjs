const fs = require("fs");
let p = fs.readFileSync("src/ui/panel.js", "utf8");

p = p.replace(
  'import { renderGlobal, reportGlobal, previewGlobal, openAdded, addGlobal, unpublishGlobal, publishGlobal, setGlobalTab } from "./views/global.js";',
  'import { renderGlobal, filterGlobalTab, openGlobalPreview, addGlobalSet, openAddedSet, reportGlobal } from "./views/global.js";\nimport { publishGlobalSet, unpublishGlobalSet } from "./views/set-detail.js";'
);

fs.writeFileSync("src/ui/panel.js", p);
