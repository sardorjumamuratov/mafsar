const fs = require('fs');
let c = fs.readFileSync('src/ui/views/global.js', 'utf8');

c = c.replace(/if \(!confirm\("Report this set as spam, harmful, or containing personal info\? It will be hidden if multiple people report it\."\)\) return;\s*try \{([\s\S]*?)\} catch\(e\) \{/, `const ok = await confirmSheet({
    title: "Report set",
    body: "Report this set as spam, harmful, or containing personal info? It will be hidden if multiple people report it.",
    confirmLabel: "Report",
    destructive: true
  });
  if (!ok) return;
  try {$1} catch(e) {`);

fs.writeFileSync('src/ui/views/global.js', c);
