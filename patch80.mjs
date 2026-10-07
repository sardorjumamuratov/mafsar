import fs from "fs";
let code = fs.readFileSync("src/ui/flows/estimation.js", "utf8");

const finishOld = `async function finishEstimation() {
  const s = estimationState;
  s.step = "summarizing";
  const n = s.results.length;
  paintLoader("Writing a summary…", \`\${n} / \${n}\`);
  const token = (s.token = {});
  try {
    const res = await send({
      type: "ESTIMATION_SUMMARY",
      results: s.results.map((r) => ({
        question: r.question.question,
        expected: \`\${r.question.reference_value} \${r.question.reference_unit}\`,
        answer: r.raw || "(skipped)",
        grade: r.grade,
      })),
    });`;

const finishNew = `async function finishEstimation() {
  const s = estimationState;
  s.step = "summarizing";
  const n = s.results.length;
  paintLoader("Writing a summary…", \`\${n} / \${n}\`);
  const token = (s.token = {});
  try {
    const res = await send({
      type: "ESTIMATION_SUMMARY",
      results: s.results.map((r) => {
        let status = "not_quite";
        if (r.grade === "spot_on") status = "correct";
        else if (r.grade === "ballpark") status = "close";
        else if (r.grade === "unit_mismatch") status = "unit_mismatch";
        return {
          question: r.question.question,
          expected: \`\${r.question.reference_value} \${r.question.reference_unit}\`,
          answer: r.raw || "(skipped)",
          grade: r.grade,
          status,
          working: r.working ? r.working.slice(0, 800) : undefined
        };
      }),
      practiceStyle: s.practiceStyle
    });`;

code = code.replace(finishOld, finishNew);

const paintSumOld = `function paintSummary(summary) {
  const s = estimationState;
  const n = s.results.length;
  const rows = s.results.map((r) => \`
    <div class="st-li roomy">
      \${verdictRow(KIND[r.grade], r.raw ? \`\${VERDICT[r.grade]} · \${r.raw}\` : "Skipped")}
      <div class="st-feedback">\${esc(r.question.question)}</div>
    </div>\`).join("");
    
  shellFor(s, {
    progress: 100,
    counter: \`\${n} / \${n}\`,
    body: \`
      <div class="st-label st-mt24">Round complete</div>
      <div class="st-list st-mt8">\${rows}</div>
      <div class="st-label st-mt24">Next time</div>
      <div class="st-feedback st-mt4">\${esc(summary.habit_to_fix)}</div>\`,
    dock: \`<button type="button" class="btn primary" data-action="return-focus">Finish</button>\`,
  });
}`;

const paintSumNew = `function paintSummary(summary) {
  const s = estimationState;
  const n = s.results.length;
  
  const score = s.results.reduce((acc, r) => acc + (r.grade === "spot_on" ? 1 : r.grade === "ballpark" ? 0.5 : 0), 0);
  
  const fbBlock = feedbackSummary({
    scoreLine: \`Score \${score} / \${n}\`,
    strongest: summary.strongest_habit,
    gap: summary.habit_to_fix
  });
  
  const rows = s.results.map((r, i) => {
    const noteObj = summary.notes?.find(n => n.index === i);
    const noteHtml = noteObj ? \`<div class="st-note st-mt4">\${esc(noteObj.message)}</div>\` : "";
    return \`
    <div class="st-li roomy">
      \${verdictRow(KIND[r.grade], r.raw ? \`\${VERDICT[r.grade]} · \${esc(r.raw)}\` : "Skipped")}
      <div class="st-feedback">\${esc(r.question.question)}</div>
      \${noteHtml}
    </div>\`;
  }).join("");
    
  shellFor(s, {
    progress: 100,
    counter: \`\${n} / \${n}\`,
    body: \`
      <div class="st-label st-mt24">Round complete</div>
      <div class="st-list st-mt8">\${rows}</div>
      <div class="st-mt24">\${fbBlock}</div>
      <button type="button" class="st-link st-mt12" id="estSuggestBtn">Turn gaps into review cards</button>\`,
    dock: \`<button type="button" class="btn primary" data-action="return-focus">Finish</button>\`,
  });
  
  document.getElementById("estSuggestBtn")?.addEventListener("click", () => {
    const gaps = [];
    if (summary.habit_to_fix) gaps.push({ type: "estimation_mistake", text: summary.habit_to_fix });
    openSuggestionSheet(s.sessionId, "estimation", gaps, s.topic, s.cards);
  });
}`;

code = code.replace(paintSumOld, paintSumNew);

fs.writeFileSync("src/ui/flows/estimation.js", code, "utf8");
