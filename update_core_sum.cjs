const fs = require('fs');
let c = fs.readFileSync('src/ui/core.js', 'utf8');

c = c.replace(/rating: studySet\?\.rating, published: studySet\?\.published /, `rating: studySet?.rating, published: studySet?.published, globalRatingCount: studySet?.globalRatingCount, globalRatingAvg: studySet?.globalRatingAvg `);

fs.writeFileSync('src/ui/core.js', c);
