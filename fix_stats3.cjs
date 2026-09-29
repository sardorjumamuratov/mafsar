const fs = require('fs');
let c = fs.readFileSync('src/ui/views/stats.js', 'utf8');

c = c.replace(/setHTML\(app, body\);/, "setHTML(app, body);\n  topOfView();");
c = c.replace(/setHTML\(app, emptyBody\);\n    return;/, "setHTML(app, emptyBody);\n    topOfView();\n    return;");

fs.writeFileSync('src/ui/views/stats.js', c);
