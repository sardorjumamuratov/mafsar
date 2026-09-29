const fs = require('fs');
let c = fs.readFileSync('src/ui/panel.js', 'utf8');

c = c.replace(/import \{ renderGlobal, filterGlobalCat, openGlobalPreview, reportGlobal \} from "\.\/views\/global\.js";/, `import { renderGlobal, filterGlobalCat, openGlobalPreview, reportGlobal, confirmPublishSet, unpublishSet } from "./views/global.js";`);

c = c.replace(/case "global-report": reportGlobal\(.*?\); break;/, `case "global-report": reportGlobal(/** @type {HTMLElement} */ (t)); break;\n      case "global-publish": confirmPublishSet(id); break;\n      case "global-unpublish": unpublishSet(id); break;`);

fs.writeFileSync('src/ui/panel.js', c);
