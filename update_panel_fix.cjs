const fs = require('fs');
let c = fs.readFileSync('src/ui/panel.js', 'utf8');

c = c.replace(/toggleSetMenu } from "\.\/views\/set-detail\.js";/, `toggleSetMenu, setRate } from "./views/set-detail.js";`);
c = c.replace(/const star = e\.target\.closest\("\.star"\);/, `const star = (/** @type {any} */ (e.target)).closest(".star");`);

fs.writeFileSync('src/ui/panel.js', c);
