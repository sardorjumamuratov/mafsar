const fs = require('fs');
let c = fs.readFileSync('shared/sync-map.js', 'utf8');

c = c.replace(/if \(set\.rating !== undefined\) st\.rating = set\.rating;/, `$&\n    if (set.published !== undefined) st.published = set.published;\n    if (set.globalRatingCount !== undefined) st.globalRatingCount = set.globalRatingCount;\n    if (set.globalRatingAvg !== undefined) st.globalRatingAvg = set.globalRatingAvg;`);

fs.writeFileSync('shared/sync-map.js', c);
