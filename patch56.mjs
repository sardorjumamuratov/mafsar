import fs from "fs";
let code = fs.readFileSync("src/ui/flows/estimation.js", "utf8");

if (!code.includes("openSuggestionSheet")) {
  code = code.replace("feedbackSummary", "feedbackSummary, openSuggestionSheet");
  
  const start = code.indexOf("function paintSummary(summary)");
  const end = code.indexOf("});\n}", start) + 5;
  let func = code.substring(start, end);
  
  func = func.replace(
    '<div class="st-mt24">${summaryBlock}</div>',
    '<div class="st-mt24">${summaryBlock}</div>\n      <button type="button" class="st-link st-mt12" id="estSuggestBtn">Turn gaps into review cards</button>'
  );
  
  func = func.replace(
    'dock: primaryBtn("return-focus", "Done"),\n  });',
    'dock: primaryBtn("return-focus", "Done"),\n  });\n\n  document.getElementById("estSuggestBtn")?.addEventListener("click", () => {\n    const gaps = s.results.filter(r => r.grade !== "spot_on").map(r => ({ type: "estimation_mistake", text: `Question: ${r.question.question} \\nExpected: ${r.question.reference_value} ${r.question.reference_unit} \\nAnswer: ${r.raw}` }));\n    if (summary.habit_to_fix) gaps.push({ type: "estimation_mistake", text: summary.habit_to_fix });\n    openSuggestionSheet(s.sessionId, "estimation", gaps, s.topic, s.cards);\n  });'
  );
  
  code = code.substring(0, start) + func + code.substring(end);
  fs.writeFileSync("src/ui/flows/estimation.js", code, "utf8");
}
