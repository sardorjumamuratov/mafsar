const fs = require('fs');
let c = fs.readFileSync('src/ui/views/stats.js', 'utf8');

c = c.replace(/var\(--bg-b\)/, `var(--surface-2)`);
c = c.replace(/var\(--primary-light\)/, `var(--primary-soft)`);

fs.writeFileSync('src/ui/views/stats.js', c);
