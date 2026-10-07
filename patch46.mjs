import fs from "fs";
let code = fs.readFileSync("src/ui/flows/design.js", "utf8");

const start = code.indexOf("function paintDesignFeedback() {");
const end = code.indexOf("\n}", start) + 2;

const toReplace = code.substring(start, end);

const replacement = `function paintDesignFeedback() {
  const s = designState;
  const g = s.grading;
  const byName = new Map((g.sections || []).map((x) => [x.section, x]));

  const rows = SECTIONS.map((sec) => {
    if (!s.sections[sec.key].trim()) return \`<div class="st-li roomy">\${verdictRow("skip", \`\${sec.title} · skipped\`)}</div>\`;
    const v = byName.get(sec.title) || byName.get(sec.key);
    if (!v) return \`<div class="st-li roomy">\${verdictRow("skip", \`\${sec.title} · not graded\`)}</div>\`;
    return \`<div class="st-li roomy">\${verdictRow(SECTION_KIND[v.verdict] || "no", sec.title)}\${v.note ? \`<div class="st-feedback">\${esc(v.note)}</div>\` : ""}</div>\`;
  }).join("");

  // The server sends no separate model answer, so this is what a strong answer covers:
  // the brief's rubric, marked against what the learner wrote.
  const points = (g.rubric_evaluation || []).map((p) => \`<div class="st-li">\${verdictRow(POINT_KIND[p.status] || "no", p.point)}\${p.note ? \`<div class="st-feedback">\${esc(p.note)}</div>\` : ""}</div>\`).join("");

  const filled = filledCount(s);
  
  const scoreLine = \`Score \${g.score} / \${g.maxScore || (g.rubric_evaluation || []).length}\`;
  const summaryBlock = feedbackSummary({
    strongest: g.strongestPart,
    gap: g.highestLeverageGap,
    scoreLine
  });

  paintShell({
    mode: "Design brief · ~15 min",
    promptHtml: briefHtml(s),
    progress: 100,
    counter: \`\${filled} / \${SECTIONS.length}\`,
    hasProgress: true,
    body: \`
      \${briefToggle}
      
      <div class="st-mt24">\${summaryBlock}</div>

      <div class="st-label st-mt24">Sections</div>
      <div class="st-list">\${rows}</div>
      <button type="button" class="st-link st-mt12" id="designModelBtn" data-action="design-toggle-model">Compare your approach</button>
      <div id="designModel" hidden>
        <div class="st-label st-mt16">A strong answer covers</div>
        <div class="st-list">\${points}</div>
        \${g.next_time ? \`<div class="st-label st-mt16">Next time</div><div class="st-text15 st-mt4">\${esc(g.next_time)}</div>\` : ""}
      </div>\`,
    dock: primaryBtn("return-focus", "Done"),
  });
}`;

code = code.substring(0, start) + replacement + code.substring(end);
if (!code.includes("feedbackSummary")) {
  code = code.replace('bindField, briefStyle, focusEnd', 'bindField, briefStyle, feedbackSummary, focusEnd');
  if (!code.includes("feedbackSummary")) {
    code = code.replace('import { bindField, focusEnd, icon, navHtml, paintShell, primaryBtn, verdictRow, waitRow } from "./shell.js";', 'import { bindField, feedbackSummary, focusEnd, icon, navHtml, paintShell, primaryBtn, verdictRow, waitRow } from "./shell.js";');
  }
}
fs.writeFileSync("src/ui/flows/design.js", code, "utf8");
