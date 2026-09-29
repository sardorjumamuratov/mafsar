const fs = require('fs');
let c = fs.readFileSync('src/ui/views/stats.js', 'utf8');

c = c.replace(/import \{ currentStreak \} from "\.\.\/\.\.\/\.\.\/shared\/streak\.js";/, `import { computeStreak } from "../../../shared/streak.js";`);
c = c.replace(/const streak = currentStreak\(activity, today\);/, `const streak = computeStreak(activity);`);

fs.writeFileSync('src/ui/views/stats.js', c);
