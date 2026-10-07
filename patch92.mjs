import fs from "fs";
let code = fs.readFileSync("src/ui/flows/design.js", "utf8");

const feedbackOld = `function paintDesignFeedback() {
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
      <button type="button" class="st-link st-mt12" id="designSuggestBtn">Turn gaps into review cards</button>

      <div class="st-label st-mt24">Sections</div>
      <div class="st-list">\${rows}</div>
      <button type="button" class="st-link st-mt12" id="designModelBtn" data-action="design-toggle-model">Compare your approach</button>
      <div id="designModel" class="st-mt24" hidden>
        <div class="st-label">A strong answer covers</div>
        <div class="st-list st-mt8">\${points}</div>
        <div class="st-label st-mt24">Next time</div>
        <div class="st-feedback st-mt4">\${esc(g.next_time)}</div>
      </div>\`,
    dock: \`<button type="button" class="btn primary" data-action="return-focus">Finish</button>\`,
  });`;

const feedbackNew = `function paintDesignFeedback() {
  const s = designState;
  const g = s.grading;
  const byName = new Map((g.sections || []).map((x) => [x.section, x]));
  
  const isGuided = s.practiceStyle === "guided";
  const activeSections = isGuided ? GUIDED_SECTIONS : SECTIONS;

  const rows = activeSections.map((sec) => {
    if (!s.sections[sec.key] || !s.sections[sec.key].trim()) return \`<div class="st-li roomy">\${verdictRow("skip", \`\${sec.title} · Skipped\`)}</div>\`;
    const v = byName.get(sec.title) || byName.get(sec.key);
    if (!v) return \`<div class="st-li roomy">\${verdictRow("skip", \`\${sec.title} · Not addressed yet\`)}</div>\`;
    return \`<div class="st-li roomy">\${verdictRow(SECTION_KIND[v.verdict] || "no", sec.title)}\${v.note ? \`<div class="st-feedback">\${esc(v.note)}</div>\` : ""}</div>\`;
  }).join("");

  const POINT_STATUS_LABEL = { covered: "Covered", partial: "Partly covered", missed: "Not addressed yet" };

  const points = (g.rubric_evaluation || []).map((p) => {
     const statusLabel = POINT_STATUS_LABEL[p.status] || "Not addressed yet";
     return \`<div class="st-li">\${verdictRow(POINT_KIND[p.status] || "no", \`\${statusLabel}: \${p.point}\`)}\${p.note ? \`<div class="st-feedback">\${esc(p.note)}</div>\` : ""}</div>\`;
  }).join("");

  const filled = filledCount(s);
  const totalRubric = g.maxScore || (g.rubric_evaluation || []).length;
  
  const scoreLine = \`Rubric coverage: \${g.score} of \${totalRubric} points\`;
  const summaryBlock = feedbackSummary({
    strongest: g.strongestPart,
    gap: g.highestLeverageGap,
    scoreLine
  });

  paintShell({
    mode: isGuided ? "Design brief · Learn concepts" : "Design brief · Interview simulation",
    promptHtml: briefHtml(s),
    progress: 100,
    counter: \`\${filled} / \${activeSections.length}\`,
    hasProgress: true,
    body: \`
      \${briefToggle}
      
      <div class="st-mt24">\${summaryBlock}</div>

      <div class="st-label st-mt24">Sections</div>
      <div class="st-list">\${rows}</div>
      <button type="button" class="st-link st-mt24" id="designModelBtn" data-action="design-toggle-model">Compare your approach</button>
      <div id="designModel" class="st-mt24" hidden>
        <div class="st-label">A strong answer covers</div>
        <div class="st-list st-mt8">\${points}</div>
        <div class="st-label st-mt24">Next time</div>
        <div class="st-feedback st-mt4">\${esc(g.next_time)}</div>
      </div>
      <div class="st-mt24"><button type="button" class="st-link" id="designSuggestBtn">Turn gaps into review cards</button></div>\`,
    dock: \`<button type="button" class="btn primary" data-action="return-focus">Finish</button>\`,
  });`;

code = code.replace(feedbackOld, feedbackNew);

// Update submitDesign string answer generation to pass style
code = code.replace(
  'const answer = assembleAnswer(s.sections, "design");',
  'const answer = assembleAnswer(s.sections, "design", s.practiceStyle);'
);

fs.writeFileSync("src/ui/flows/design.js", code, "utf8");
