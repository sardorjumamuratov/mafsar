const fs = require('fs');
let c = fs.readFileSync('shared/sync-map.js', 'utf8');
c = c.replace(/\.\.\.\(st\.chainOverrides \? \{ chainOverrides: st\.chainOverrides \} : \{\}\),/, `$&\n          ...(st.rating !== undefined ? { rating: st.rating } : {}),`);
c = c.replace(/if \(set\.chainOverrides !== undefined\) st\.chainOverrides = set\.chainOverrides;/, `$&\n    if (set.rating !== undefined) st.rating = set.rating;`);
fs.writeFileSync('shared/sync-map.js', c);
