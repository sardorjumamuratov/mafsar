import fs from "fs";
let code = fs.readFileSync("src/background/service-worker.js", "utf8");

code = code.replace(
  'answer: String(msg.answer || ""),\n        usedHint: Boolean(msg.usedHint),\n      });',
  'answer: String(msg.answer || ""),\n        usedHint: Boolean(msg.usedHint),\n        componentId: msg.componentId ? String(msg.componentId) : undefined,\n        parts: msg.parts ? {\n          whatBreaks: String(msg.parts.whatBreaks || ""),\n          whyItFails: String(msg.parts.whyItFails || ""),\n          howToFix: String(msg.parts.howToFix || "")\n        } : undefined\n      });'
);

fs.writeFileSync("src/background/service-worker.js", code, "utf8");
