const fs = require('fs');
let c = fs.readFileSync('src/ui/panel.js', 'utf8');

c = c.replace(/case "nav-back": goToActiveTab\(\); break;/, `case "nav-back": goToActiveTab(); break;\n    case "nav-home": renderHome(); break;`);

fs.writeFileSync('src/ui/panel.js', c);
