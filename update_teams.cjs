const fs = require('fs');
let c = fs.readFileSync('src/ui/views/teams.js', 'utf8');

c = c.replace(/<div class="ahd"><div class="h-title">Teams<\/div><\/div>/g, `\${globalHeader("teams")}`);

// Wait, I need to import globalHeader from global.js!
c = `import { globalHeader } from "./global.js";\n` + c;

fs.writeFileSync('src/ui/views/teams.js', c);
