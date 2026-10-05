// The bundled Geist font must be a real font. It once shipped as a 7-byte
// file reading "dummy": every load logged a decode error and the panel drew
// in the system font, and the screens no longer matched docs/design.
// Run: node tests/vendor-font.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const dir = path.join(import.meta.dirname, "..", "src", "vendor", "geist");
const font = fs.readFileSync(path.join(dir, "Geist[wght].woff2"));
const license = fs.readFileSync(path.join(dir, "LICENSE"), "utf8");

// A WOFF2 file starts with the signature "wOF2"; Geist's variable font is tens of KB.
assert.equal(font.subarray(0, 4).toString("latin1"), "wOF2", "Geist[wght].woff2 is not a WOFF2 font");
assert.ok(font.length > 20_000, `Geist[wght].woff2 is only ${font.length} bytes`);
// The OFL requires its text to travel with the font.
assert.match(license, /SIL Open Font License, Version 1\.1/);
assert.match(license, /Geist Project Authors/);

console.log("PASS vendor font");
