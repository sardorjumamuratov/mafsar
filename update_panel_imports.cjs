const fs = require('fs');
let c = fs.readFileSync('src/ui/panel.js', 'utf8');

if (!c.includes('import { renderGlobal')) {
  c = c.replace(/import \{ createTeamFromForm[\s\S]*?\} from "\.\/views\/teams\.js";/, `$&` + `\nimport { renderGlobal, filterGlobalCat, openGlobalPreview, reportGlobal, confirmPublishSet, unpublishSet } from "./views/global.js";`);
  fs.writeFileSync('src/ui/panel.js', c);
}
