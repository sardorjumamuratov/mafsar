const fs = require('fs');
let c = fs.readFileSync('src/ui/views/global.js', 'utf8');
c = c.replace(/export function confirmPublishSet\(setId\) \{/, `export async function confirmPublishSet(setId) {`);
fs.writeFileSync('src/ui/views/global.js', c);
