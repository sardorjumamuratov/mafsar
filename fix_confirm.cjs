const fs = require('fs');
let c = fs.readFileSync('src/ui/views/global.js', 'utf8');

c = c.replace(/confirmSheet\(\{[\s\S]*?onConfirm: async \(\) => \{([\s\S]*?)\}\n  \}\);/, `const ok = await confirmSheet({
    title: "Make it global",
    body: "Anyone using Mafsar can see and copy the cards and quiz. Your name and email are never shown, and your progress stays yours.<br><br><b>Don't publish personal or patient details.</b><br><br>You can take it down any time.",
    confirmLabel: "Publish"
  });
  if (ok) {$1}`);

fs.writeFileSync('src/ui/views/global.js', c);
