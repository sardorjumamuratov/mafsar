const fs = require('fs');
let c = fs.readFileSync('src/ui/core.js', 'utf8');
c = c.replace(/return \{ total, mastered, learning, fresh, due, progress: total \? Math\.round\(\(mastered \/ total\) \* 100\) : 0 \};/, `return { total, mastered, learning, fresh, due, progress: total ? Math.round((mastered / total) * 100) : 0, rating: studySet?.rating, published: studySet?.published };`);
fs.writeFileSync('src/ui/core.js', c);
