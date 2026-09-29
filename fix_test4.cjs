const fs = require('fs');
let c = fs.readFileSync('tests/ui-static.test.mjs', 'utf8');

c = c.replace(/const sets = read\("\.\.\/src\/ui\/views\/sets\.js"\);\s*assert\.ok\(sets\.includes\('id="captureCurrentBtn"'\) && sets\.includes\("refreshCaptureCurrentButton"\), "the capture button must carry kind\/origin"\);/, `const capFile = read("../src/ui/capture.js");
  const panelHtml = read("../src/ui/panel.html");
  assert.ok(panelHtml.includes('id="captureCurrentBtn"') && capFile.includes("refreshCaptureDock"), "the capture button must carry kind/origin");`);

fs.writeFileSync('tests/ui-static.test.mjs', c);
