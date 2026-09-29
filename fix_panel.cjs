const fs = require('fs');
let c = fs.readFileSync('src/ui/panel.js', 'utf8');

c = c.replace(/import \{ doImport, previewImport, renderImport \} from "\.\/views\/import\.js";/, `import { doImport, previewImport, renderImport, lookupShare, importSharedSet } from "./views/import.js";`);

fs.writeFileSync('src/ui/panel.js', c);

let cap = fs.readFileSync('src/ui/capture.js', 'utf8');
cap = cap.replace(/const currentBtn = document\.getElementById\("captureCurrentBtn"\);/, `const currentBtn = /** @type {HTMLButtonElement} */ (document.getElementById("captureCurrentBtn"));`);
fs.writeFileSync('src/ui/capture.js', cap);
