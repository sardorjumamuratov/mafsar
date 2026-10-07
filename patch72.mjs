import fs from "fs";
let code = fs.readFileSync("src/ui/flows/bottleneck.js", "utf8");

const start = code.indexOf("export async function submitBottleneck() {");
const end = code.indexOf("function paintBottleneckFeedback() {", start);

const newFunc = `export async function submitBottleneck() {
  const s = bottleneckState;
  if (!s || s.step !== "answering") return;
  
  let answer = "";
  let parts = undefined;
  
  if (s.task.practiceStyle === "simulation") {
    const box = document.getElementById("bottleneckAnswer");
    answer = (/** @type {HTMLTextAreaElement|null} */ (box))?.value.trim() || s.draft;
    s.draft = answer;
  } else {
    parts = {
      flaw: s.draft.trim(),
      reason: s.draft2.trim(),
      fix: s.draft3.trim()
    };
    answer = \`What breaks: \${parts.flaw}\\nWhy it fails: \${parts.reason}\\nFix and tradeoff: \${parts.fix}\`;
  }
  
  if (!answer.trim()) return;

  s.step = "grading";
  paintLoader("Reviewing your answer…");
  const token = (s.token = {});
  try {
    const res = await send({ 
      type: "BOTTLENECK_GRADE", 
      state: s.task.state, 
      answer, 
      componentId: s.selectedComponentId, 
      parts, 
      usedHint: s.usedHint 
    });
    if (bottleneckState !== s || s.token !== token) return;
    s.result = res;
    s.step = "checked";
    await Promise.all([
      bumpActivity(1),
      appendReviewLog(drillLogEntry({ kind: "bottleneck", sessionId: s.sessionId, fraction: (Number(res.score) || 0) / 3, id: uid() })),
    ]);
    paintBottleneckFeedback();
  } catch (e) {
    if (bottleneckState !== s || s.token !== token) return;
    toast(e.message);
    paintBottleneckQuestion();
  }
}

`;

code = code.substring(0, start) + newFunc + code.substring(end);
fs.writeFileSync("src/ui/flows/bottleneck.js", code, "utf8");
