const fs = require('fs');
let c = fs.readFileSync('src/ui/panel.js', 'utf8');

const oldListener = `window.addEventListener(SYNC_PULLED_EVENT, () => {
  if (inFocusView()) return;`;

const newListener = `window.addEventListener(SYNC_PULLED_EVENT, () => {
  if (document.querySelector(".view .ahd .h-title")?.textContent === "Your Stats") return renderStats();
  if (inFocusView()) return;`;

c = c.replace(oldListener, newListener);
fs.writeFileSync('src/ui/panel.js', c);
