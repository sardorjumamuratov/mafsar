const fs = require('fs');
let c = fs.readFileSync('src/ui/views/stats.js', 'utf8');

c = c.replace(/import \{ app, bundle, esc, setHTML, summarize, setFor, XBTN \} from "\.\.\/core\.js";/, `import { app, bundle, esc, setHTML, summarize, setFor, topOfView, XBTN } from "../core.js";`);

fs.writeFileSync('src/ui/views/stats.js', c);
