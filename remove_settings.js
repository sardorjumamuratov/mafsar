const fs = require('fs');
let content = fs.readFileSync('src/ui/panel.js', 'utf8');

content = content.replace(/<button class="btn btn-ghost btn-block" data-action="settings">.*?<\/button>\n*/g, '');
content = content.replace(/<button class="iconbtn" data-action="settings" aria-label="Settings">[\s\S]*?<\/button>\n*/g, '');
content = content.replace(/\s*case "settings":.*?break;/g, '');

fs.writeFileSync('src/ui/panel.js', content);
