const fs = require('fs');
let c = fs.readFileSync('src/ui/views/stats.js', 'utf8');

c = c.replace(/..\/..\/shared\/srs\.js/, `../../../shared/srs.js`);
c = c.replace(/..\/..\/shared\/streak\.js/, `../../../shared/streak.js`);
c = c.replace(/..\/..\/shared\/readiness\.js/, `../../../shared/readiness.js`);
c = c.replace(/..\/..\/shared\/insights\.js/, `../../../shared/insights.js`);

fs.writeFileSync('src/ui/views/stats.js', c);
