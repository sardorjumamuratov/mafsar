const fs = require("fs");
let p = fs.readFileSync("src/ui/panel.js", "utf8");

p = p.replace(
  'import { renderGlobal, filterGlobalTab, previewGlobal, openAdded, addGlobal, unpublishGlobal, publishGlobal, setGlobalTab } from "./views/global.js";',
  'import { renderGlobal, filterGlobalTab, openGlobalPreview, addGlobalSet, openAddedSet, reportGlobal } from "./views/global.js";\nimport { publishGlobalSet, unpublishGlobalSet } from "./views/set-detail.js";'
);

p = p.replace(
  /case "global-tab": setGlobalTab\(\(\/\*\* @type \{any\} \*\/ \(t\)\).dataset.tab\); break;/,
  'case "global-tab": filterGlobalTab(t); break;'
);
p = p.replace(
  /case "global-preview": previewGlobal\(id\); break;/,
  'case "global-preview": openGlobalPreview(t); break;'
);
p = p.replace(
  /case "global-open-added": openAdded\(id\); break;/,
  'case "global-open-added": openAddedSet(t); break;'
);
p = p.replace(
  /case "global-add-set": addGlobal\(id\); break;/,
  'case "global-add-set": addGlobalSet(t); break;'
);
p = p.replace(
  /case "global-report": reportGlobal\(id\); break;/,
  'case "global-report": reportGlobal(t); break;'
);
p = p.replace(
  /case "global-unpublish": unpublishGlobal\(id\); break;/,
  'case "global-unpublish": unpublishGlobalSet(id); break;'
);
p = p.replace(
  /case "global-publish": publishGlobal\(id\); break;/,
  'case "global-publish": publishGlobalSet(id); break;'
);

fs.writeFileSync("src/ui/panel.js", p);
