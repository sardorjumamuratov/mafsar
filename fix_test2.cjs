const fs = require('fs');
let c = fs.readFileSync('tests/ui-static.test.mjs', 'utf8');

c = c.replace(/test\("sets\.js renders id='captureAnswerBtn' unconditionally", \(\) => \{[\s\S]*?\}\);/, `test("panel.html renders id='captureAnswerBtn' unconditionally", () => {
  const file = fs.readFileSync(join(__dirname, "../src/ui/panel.html"), "utf8");
  assert.ok(file.includes('id="captureAnswerBtn"'));
});`);

c = c.replace(/test\("refreshCaptureAnswerButton uses Math\.random\(\) token guard", \(\) => \{[\s\S]*?\}\);/, `test("refreshCaptureDock uses Math.random() token guard", () => {
  const file = fs.readFileSync(join(__dirname, "../src/ui/capture.js"), "utf8");
  assert.ok(file.includes('const token = Math.random();'));
  assert.ok(file.includes('if (captureAnswerToken !== token) return;'));
});`);

fs.writeFileSync('tests/ui-static.test.mjs', c);
