import fs from "fs";
let code = fs.readFileSync("src/ui/flows/bottleneck.js", "utf8");

if (!code.includes("openSuggestionSheet")) {
  code = code.replace("feedbackSummary", "feedbackSummary, openSuggestionSheet");
  
  const start = code.indexOf("function paintBottleneckFeedback()");
  const end = code.indexOf("});\n}", start) + 5;
  let func = code.substring(start, end);
  
  func = func.replace(
    '<div class="st-mt24">${summaryBlock}</div>',
    '<div class="st-mt24">${summaryBlock}</div>\n      <button type="button" class="st-link st-mt12" id="bnSuggestBtn">Turn gaps into review cards</button>'
  );
  
  func = func.replace(
    'dock: primaryBtn("return-focus", "Finish"),\n  });',
    'dock: primaryBtn("return-focus", "Finish"),\n  });\n\n  document.getElementById("bnSuggestBtn")?.addEventListener("click", () => {\n    const gaps = [];\n    if (r.criteria?.foundFlaw?.status !== "covered") gaps.push({ type: "missed_bottleneck", text: `Missed flaw: ${r.planted_flaw}` });\n    if (r.criteria?.proposedFix?.status !== "covered") gaps.push({ type: "missing_tradeoff", text: `Missed fix or trade-off. Model solution: ${r.model_solution}` });\n    if (r.highestLeverageGap) gaps.push({ type: "missed_bottleneck", text: r.highestLeverageGap });\n    openSuggestionSheet(s.sessionId, "bottleneck", gaps, s.topic, s.cards);\n  });'
  );
  
  code = code.substring(0, start) + func + code.substring(end);
  fs.writeFileSync("src/ui/flows/bottleneck.js", code, "utf8");
}
