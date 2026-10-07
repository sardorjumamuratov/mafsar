import fs from "fs";
let code = fs.readFileSync("server/tests/drills.test.ts", "utf8");

// The old text has `body.found_flaw` and `body.fix_works`
const toReplace = `      expect(body.found_flaw).toBe(true);
      expect(body.fix_works).toBe(false); // only a real true counts
      expect(body.score).toBe(1.5);`;

const replacement = `      expect(body.criteria.foundFlaw.status).toBe("covered");
      expect(body.criteria.proposedFix.status).toBe("missed"); // only a real true counts
      expect(body.score).toBe(2);`;

if (code.includes(toReplace)) {
  code = code.replace(toReplace, replacement);
  fs.writeFileSync("server/tests/drills.test.ts", code, "utf8");
  console.log("Patched correctly");
} else {
  console.log("Could not find text to replace!");
}
