const fs = require('fs');
let c = fs.readFileSync('src/ui/views/set-detail.js', 'utf8');

const exportRateSet = `export async function setRate(id, val) {
  const { studySets } = await bundle();
  const st = setFor(id, studySets);
  if (!st) return;
  st.rating = val || null;
  st.updatedAt = new Date().toISOString();
  paintDetail();
  syncNow();
}
`;

c = c + '\n' + exportRateSet;
fs.writeFileSync('src/ui/views/set-detail.js', c);
