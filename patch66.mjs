import fs from "fs";
let code = fs.readFileSync("src/ui/flows/bottleneck.js", "utf8");

// Handle bottleneck-continue
code = code.replace(
  '  if (action === "toggle-scenario") {',
  '  if (action === "continue") {\n    s.guidedStep++;\n    paintBottleneckQuestion();\n    return;\n  }\n  if (action === "toggle-scenario") {'
);

// In submitBottleneck, construct the payload correctly.
code = code.replace(
  'const answer = document.getElementById("bottleneckAnswer")?.value.trim() || s.draft;',
  `let answer = "";
  let parts = undefined;
  if (s.task.practiceStyle === "simulation") {
    answer = document.getElementById("bottleneckAnswer")?.value.trim() || s.draft;
  } else {
    parts = {
      whatBreaks: s.draft.trim(),
      whyItFails: s.draft2.trim(),
      howToFix: s.draft3.trim()
    };
    answer = \`What breaks: \${parts.whatBreaks}\\nWhy it fails: \${parts.whyItFails}\\nFix and tradeoff: \${parts.howToFix}\`;
  }`
);

// Also pass `componentId: s.selectedComponentId` and `parts` to `/v1/bottleneck-grade`.
code = code.replace(
  'type: "BOTTLENECK_GRADE", state: s.task.state, answer',
  'type: "BOTTLENECK_GRADE", state: s.task.state, answer, componentId: s.selectedComponentId, parts'
);

fs.writeFileSync("src/ui/flows/bottleneck.js", code, "utf8");
