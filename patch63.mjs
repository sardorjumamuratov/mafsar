import fs from "fs";
let code = fs.readFileSync("src/ui/flows/bottleneck.js", "utf8");

code = code.replace(
  'export function bottleneckAction(action) {',
  `export function bottleneckAction(action) {
  const s = bottleneckState;
  if (!s) return;
  if (action.startsWith("rail-")) {
    const idx = parseInt(action.split("-")[1], 10);
    if (!isNaN(idx)) {
      s.selectedComponentId = s.task.components ? s.task.components[idx].id : String(idx);
      s.selectedComponentIdx = idx;
      paintBottleneckQuestion();
    }
    if (action === "rail-clear") {
      s.selectedComponentId = null;
      s.selectedComponentIdx = -1;
      paintBottleneckQuestion();
    }
    return;
  }`
);

fs.writeFileSync("src/ui/flows/bottleneck.js", code, "utf8");
