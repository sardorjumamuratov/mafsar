import fs from "fs";
let code = fs.readFileSync("src/ui/flows/estimation.js", "utf8");

const start = code.indexOf("function paintSummary(summary) {");
const end = code.indexOf("}", code.indexOf("});", start)) + 1;

const replacement = `function paintSummary(summary) {
  const s = estimationState;
  const n = s.results.length;
  const rows = s.results.map((r) => \`
    <div class="st-li roomy">
      \${verdictRow(KIND[r.grade], r.raw ? \`\${VERDICT[r.grade]} · \${r.raw}\` : "Skipped")}
      <div class="st-feedback">\${esc(r.question.question)}</div>
    </div>\`).join("");
    
  const score = s.results.reduce((acc, r) => acc + (r.grade === "spot_on" ? 1 : r.grade === "ballpark" ? 0.5 : 0), 0);
  const scoreLine = \`Score \${score} / \${n}\`;
  
  const summaryBlock = feedbackSummary({
    strongest: summary.strongest_habit,
    gap: summary.habit_to_fix,
    scoreLine
  });

  paintShell({
    mode: "Estimate",
    prompt: "Round complete",
    promptClass: "ask",
    progress: 100,
    counter: \`\${n} / \${n}\`,
    body: \`
      <div class="st-mt24">\${summaryBlock}</div>
      \${summary.notes && summary.notes.length > 0 ? \`
      <div class="st-label st-mt24">Notes</div>
      <div class="st-list">\${summary.notes.map(note => \`<div class="st-li st-feedback">\${esc(note.message)}</div>\`).join("")}</div>
      \` : ""}
      <div class="st-label st-mt24">Your answers</div>
      <div class="st-list">\${rows}</div>\`,
    dock: primaryBtn("return-focus", "Done"),
  });
}`;

code = code.substring(0, start) + replacement + code.substring(end);
if (!code.includes("feedbackSummary")) {
  code = code.replace('bindField, focusEnd', 'bindField, feedbackSummary, focusEnd');
  if (!code.includes("feedbackSummary")) {
    code = code.replace('import { bindField, focusEnd, paintShell, primaryBtn, secondaryBtn, verdictRow, waitRow } from "./shell.js";', 'import { bindField, feedbackSummary, focusEnd, paintShell, primaryBtn, secondaryBtn, verdictRow, waitRow } from "./shell.js";');
  }
}
fs.writeFileSync("src/ui/flows/estimation.js", code, "utf8");
