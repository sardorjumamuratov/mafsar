import fs from "fs";
let code = fs.readFileSync("tests/estimation.test.mjs", "utf8");

code = code.replace(
  'assert.equal(gradeEstimation(ref, ans), "off");',
  'assert.equal(gradeEstimation(ref, ans), "unit_mismatch");'
);

fs.writeFileSync("tests/estimation.test.mjs", code, "utf8");
