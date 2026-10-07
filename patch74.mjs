import fs from "fs";

function patchDrill(file, drillStartCode, payloadCode) {
  let code = fs.readFileSync(file, "utf8");
  if (!code.includes('import { getDefaultPracticeStyle }')) {
    code = `import { getDefaultPracticeStyle } from "../../storage/practice-style.js";\n` + code;
  }
  
  // Inside drillStartCode, add: const style = set?.practiceStyle || await getDefaultPracticeStyle() || "guided";
  if (!code.includes('const style = set?.practiceStyle || await getDefaultPracticeStyle() || "guided";')) {
    code = code.replace(
      drillStartCode,
      `${drillStartCode}\n  const style = set?.practiceStyle || await getDefaultPracticeStyle() || "guided";`
    );
  }
  
  // In payloadCode, append practiceStyle: style. But wait, payload is sent inside request function!
  // I need to store style in the state object.
  if (!code.includes('practiceStyle: style,')) {
    code = code.replace(
      'topic: String(',
      'practiceStyle: style,\n    topic: String('
    );
  }
  
  fs.writeFileSync(file, code, "utf8");
}

patchDrill("src/ui/flows/bottleneck.js", "const session = sessions.find((s) => s.id === sessionId);");
patchDrill("src/ui/flows/design.js", "if (!cards.length) return toast(\"This set has no cards to drill with yet.\");");
patchDrill("src/ui/flows/estimation.js", "const session = sessions.find((s) => s.id === sessionId);");

// Now update the request functions
let bot = fs.readFileSync("src/ui/flows/bottleneck.js", "utf8");
bot = bot.replace('concept: s.topic, reference: s.cards }', 'concept: s.topic, reference: s.cards, practiceStyle: s.practiceStyle }');
fs.writeFileSync("src/ui/flows/bottleneck.js", bot, "utf8");

let des = fs.readFileSync("src/ui/flows/design.js", "utf8");
des = des.replace('concept: s.topic, reference: s.cards }', 'concept: s.topic, reference: s.cards, practiceStyle: s.practiceStyle }');
fs.writeFileSync("src/ui/flows/design.js", des, "utf8");

let est = fs.readFileSync("src/ui/flows/estimation.js", "utf8");
est = est.replace('concept: s.topic, reference: s.cards }', 'concept: s.topic, reference: s.cards, practiceStyle: s.practiceStyle }');
fs.writeFileSync("src/ui/flows/estimation.js", est, "utf8");
