import fs from "fs";
let code = fs.readFileSync("src/storage/estimation.js", "utf8");

code = code.replace(
  'if (!ref || !ans || !sameKind(ref, ans)) return "off";',
  'if (!ref || !ans || !sameKind(ref, ans)) return "unit_mismatch";'
);

code = code.replace(
  'return `The answer is ${KIND_WORDS[ref.kind]}, but you gave ${KIND_WORDS[ans.kind]}.`;',
  'return `This question asks for ${KIND_WORDS[ref.kind]}, but your answer is ${KIND_WORDS[ans.kind]}.`;'
);

fs.writeFileSync("src/storage/estimation.js", code, "utf8");
