const fs = require('fs');
let c = fs.readFileSync('src/ui/views/set-detail.js', 'utf8');

c = c.replace(/class="rating-ctrl"/, `class="rating-ctrl" data-action="rate-set"`);

fs.writeFileSync('src/ui/views/set-detail.js', c);
