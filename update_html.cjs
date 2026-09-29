const fs = require('fs');
let c = fs.readFileSync('src/ui/panel.html', 'utf8');
c = c.replace(/    <nav id="bottomNav">/, `    <div id="captureDock" class="capture-dock hidden">
      <button id="captureAnswerBtn" class="btn btn-primary hidden" data-action="capture-last-answer">Capture answer</button>
      <button id="captureCurrentBtn" class="btn btn-primary" data-action="capture-current">Capture page</button>
    </div>
    <nav id="bottomNav">`);
fs.writeFileSync('src/ui/panel.html', c);
