const fs = require('fs');
let c = fs.readFileSync('src/ui/panel.js', 'utf8');

c = c.replace(/import \{ renderGlobal \} from "\.\/views\/global\.js";/, `import { renderGlobal, filterGlobalCat, openGlobalPreview, reportGlobal } from "./views/global.js";`);

const actionsToAdd = `
      case "nav-global": renderGlobal(); break;
      case "global-seg-discover": renderGlobal(); break;
      case "global-seg-teams": renderTeams(); break;
      case "global-cat": filterGlobalCat(/** @type {HTMLElement} */ (t)); break;
      case "global-preview": openGlobalPreview(/** @type {HTMLElement} */ (t)); break;
      case "global-report": reportGlobal(/** @type {HTMLElement} */ (t)); break;`;

c = c.replace(/case "nav-teams": renderTeams\(\); break;/, `case "nav-teams": renderTeams(); break;` + actionsToAdd);

fs.writeFileSync('src/ui/panel.js', c);
