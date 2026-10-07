import fs from "fs";
let code = fs.readFileSync("src/ui/flows/bottleneck.js", "utf8");

const start = code.indexOf("function paintBottleneckFeedback() {");
if (start !== -1) {
  const replacement = `function paintBottleneckFeedback() {
  const s = bottleneckState;
  const r = s.result;
  const kind = r.verdict === "correct" ? "ok" : r.verdict === "partly_right" ? "part" : "no";
  const label = { ok: "Correct", part: "Partly right", no: "Not quite" }[kind] || "Not quite";
  const arch = s.task.components || s.task.architecture || [];
  
  let failingIdx = -1;
  if (r.failingComponentId) {
    failingIdx = arch.findIndex(c => c.id === r.failingComponentId);
  } else {
    failingIdx = failingIndex(arch, r.planted_flaw);
  }

  const scoreLine = \`Score \${r.score} / \${r.maxScore || 3}\${r.hintPenalty ? " (hint penalty applied)" : ""}\`;
  
  const summaryBlock = feedbackSummary({
    strongest: r.strongestPart,
    gap: r.highestLeverageGap,
    scoreLine
  });

  const criteriaBlock = r.criteria ? \`
    <div class="st-mt24" style="display:flex;flex-direction:column;gap:12px">
      \${Object.entries(r.criteria).map(([k, v]) => {
        const title = k === "foundFlaw" ? "Found flaw" : k === "explainedFailure" ? "Explained failure" : "Proposed fix";
        const iconName = v.status === "covered" ? "check" : v.status === "partial" ? "check" : "x";
        const color = v.status === "covered" ? "var(--status-mastered)" : v.status === "partial" ? "var(--status-learning)" : "var(--text-secondary)";
        return \`<div style="display:flex;gap:12px;align-items:start">
          <span style="color:\${color};margin-top:2px">\${icon(iconName, 16, 2.5)}</span>
          <div>
            <div style="font-weight:650;font-size:14px;color:var(--text-primary)">\${title}</div>
            \${v.note ? \`<div style="font-size:14px;color:var(--text-secondary);margin-top:2px">\${esc(v.note)}</div>\` : ""}
          </div>
        </div>\`;
      }).join("")}
    </div>
  \` : "";

  paintShell({
    mode: "What breaks",
    progress: 100,
    counter: "1 / 1",
    hasProgress: true,
    promptHtml: \`<div class="st-prompt text st-clamp" id="bnScenario">\${esc(s.task.narrative)}</div>\`,
    body: \`
      <button type="button" class="st-link st-mt6" id="bnScenarioBtn" data-action="bottleneck-toggle-scenario">Show full scenario</button>
      <div class="st-label st-mt20">Architecture</div>
      \${rail(arch, failingIdx)}
      <div class="st-mt24">\${verdictRow(kind, label)}</div>
      \${r.feedback ? \`<div class="st-feedback">\${esc(r.feedback)}</div>\` : ""}
      \${r.alternateProblem ? \`<div class="st-feedback">You also spotted a real problem: \${esc(r.alternateProblem.description)}</div>\` : ""}
      
      <div class="st-mt24">\${summaryBlock}</div>
      \${criteriaBlock}
      
      <button type="button" class="st-link st-mt24" id="bnModelBtn" data-action="bottleneck-toggle-model">Compare your approach</button>
      <div id="bnModel" hidden>
        <div class="st-label st-mt16">The flaw</div>
        <div class="st-text15 st-mt4">\${esc(r.modelAnswer?.flaw || r.planted_flaw)}</div>
        \${(r.modelAnswer?.whyItFails || r.why_it_fails) ? \`<div class="st-label st-mt16">Why it fails</div><div class="st-text15 st-mt4">\${esc(r.modelAnswer?.whyItFails || r.why_it_fails)}</div>\` : ""}
        <div class="st-label st-mt16">A good fix</div>
        <div class="st-text15 st-mt4">\${esc(r.modelAnswer?.goodFix || r.model_solution)}</div>
        \${(r.modelAnswer?.tradeoff || r.tradeoff) ? \`<div class="st-label st-mt16">Trade-off</div><div class="st-text15 st-mt4">\${esc(r.modelAnswer?.tradeoff || r.tradeoff)}</div>\` : ""}
      </div>\`,
    dock: primaryBtn("return-focus", "Finish"),
  });
}
`;
  code = code.substring(0, start) + replacement;
  if (!code.includes("feedbackSummary")) {
    code = code.replace('import { bindField, focusEnd, icon, paintShell, primaryBtn, verdictRow, waitRow } from "./shell.js";', 'import { bindField, feedbackSummary, focusEnd, icon, paintShell, primaryBtn, verdictRow, waitRow } from "./shell.js";');
  } else if (!code.includes("feedbackSummary,")) {
    code = code.replace('bindField, focusEnd', 'bindField, feedbackSummary, focusEnd');
  }
  fs.writeFileSync("src/ui/flows/bottleneck.js", code, "utf8");
  console.log("Patched bottleneck.js");
} else {
  console.log("Could not find start index");
}
