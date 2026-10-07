import fs from "fs";
let code = fs.readFileSync("src/ui/flows/design.js", "utf8");

code = code.replace(
  'import { SECTIONS, answerTooLong, assembleAnswer, emptySections, MAX_DESIGN_CHARS, rubricScore } from "../../storage/design.js";',
  'import { SECTIONS, GUIDED_SECTIONS, answerTooLong, assembleAnswer, emptySections, MAX_DESIGN_CHARS, rubricScore } from "../../storage/design.js";'
);

code = code.replace(
  'const CHIP = { requirements: "Requirements", estimates: "Estimates", api: "API", dataModel: "Data model", components: "Components", bottlenecks: "Trade-offs" };',
  'const CHIP = { requirements: "Requirements", estimates: "Estimates", api: "API", dataModel: "Data model", components: "Components", tradeoffs: "Trade-offs", bottlenecks: "Trade-offs" };'
);

code = code.replace(
  'sections: emptySections(),',
  'sections: emptySections("design", style),'
);

code = code.replace(
  'activeSectionKey: SECTIONS[0].key,',
  'activeSectionKey: (style === "guided" ? GUIDED_SECTIONS : SECTIONS)[0].key,\n    dontKnowLevel: 0,\n    conceptChipExpanded: null,\n    checkpoint: null,'
);

// We need to pass practiceStyle: s.practiceStyle when calling DESIGN_TASK. 
// We already patched that.
// Let's add constraints to state when received.
code = code.replace(
  's.rubric = res.rubric || [];',
  's.rubric = res.rubric || [];\n    s.constraints = res.constraints || [];'
);

// Let's also patch filledCount.
code = code.replace(
  'function filledCount(s) {',
  'function filledCount(s) {\n  const activeSections = s.practiceStyle === "guided" ? GUIDED_SECTIONS : SECTIONS;'
);
code = code.replace(
  'return SECTIONS.filter((sec) => s.sections[sec.key].trim().length > 0).length;',
  'return activeSections.filter((sec) => s.sections[sec.key] && s.sections[sec.key].trim().length > 0).length;'
);

fs.writeFileSync("src/ui/flows/design.js", code, "utf8");
