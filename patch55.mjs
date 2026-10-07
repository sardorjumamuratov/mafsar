import fs from "fs";
let code = fs.readFileSync("src/ui/flows/design.js", "utf8");

if (!code.includes("openSuggestionSheet")) {
  code = code.replace("feedbackSummary", "feedbackSummary, openSuggestionSheet");
  
  const start = code.indexOf("function paintDesignFeedback()");
  const end = code.indexOf("});\n}", start) + 5;
  let func = code.substring(start, end);
  
  func = func.replace(
    '<div class="st-mt24">${summaryBlock}</div>',
    '<div class="st-mt24">${summaryBlock}</div>\n      <button type="button" class="st-link st-mt12" id="designSuggestBtn">Turn gaps into review cards</button>'
  );
  
  // Add event listener
  func = func.replace(
    'dock: primaryBtn("return-focus", "Done"),\n  });',
    'dock: primaryBtn("return-focus", "Done"),\n  });\n\n  document.getElementById("designSuggestBtn")?.addEventListener("click", () => {\n    const gaps = (g.rubric_evaluation || []).filter(p => p.status !== "covered").map(p => ({ type: p.status === "partial" ? "partial_rubric" : "missed_rubric", text: p.point }));\n    if (g.highestLeverageGap) gaps.push({ type: "missed_rubric", text: g.highestLeverageGap });\n    openSuggestionSheet(s.sessionId, "design", gaps, s.topic, s.cards);\n  });'
  );
  
  code = code.substring(0, start) + func + code.substring(end);
  fs.writeFileSync("src/ui/flows/design.js", code, "utf8");
}
