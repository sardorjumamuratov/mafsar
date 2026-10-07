import fs from "fs";
let code = fs.readFileSync("src/ui/flows/bottleneck.js", "utf8");

code = code.replace(
  'parts = {\n      whatBreaks: s.draft.trim(),\n      whyItFails: s.draft2.trim(),\n      howToFix: s.draft3.trim()\n    };',
  'parts = {\n      flaw: s.draft.trim(),\n      reason: s.draft2.trim(),\n      fix: s.draft3.trim()\n    };'
);

code = code.replace(
  'answer = \`What breaks: \${parts.whatBreaks}\\nWhy it fails: \${parts.whyItFails}\\nFix and tradeoff: \${parts.howToFix}\`;',
  'answer = \`What breaks: \${parts.flaw}\\nWhy it fails: \${parts.reason}\\nFix and tradeoff: \${parts.fix}\`;'
);

fs.writeFileSync("src/ui/flows/bottleneck.js", code, "utf8");

let swCode = fs.readFileSync("src/background/service-worker.js", "utf8");
swCode = swCode.replace(
  'parts: msg.parts ? {\n          whatBreaks: String(msg.parts.whatBreaks || ""),\n          whyItFails: String(msg.parts.whyItFails || ""),\n          howToFix: String(msg.parts.howToFix || "")\n        } : undefined',
  'parts: msg.parts ? {\n          flaw: String(msg.parts.flaw || ""),\n          reason: String(msg.parts.reason || ""),\n          fix: String(msg.parts.fix || "")\n        } : undefined'
);
fs.writeFileSync("src/background/service-worker.js", swCode, "utf8");
