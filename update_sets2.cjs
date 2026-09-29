const fs = require('fs');
let c = fs.readFileSync('src/ui/views/sets.js', 'utf8');

const regex = /export async function lookupShare\(\) \{[\s\S]*?renderSetDetail\(session\.id, "cards"\);\s*\}/;
c = c.replace(regex, '');

// Also remove `export async function refreshCaptureCurrentButton` and `refreshCaptureAnswerButton`
const refreshRegex = /export async function refreshCaptureCurrentButton\(\) \{[\s\S]*?delete btn\.dataset\.origin;\r?\n    \}\r?\n  \}/;
c = c.replace(refreshRegex, '');

fs.writeFileSync('src/ui/views/sets.js', c);
