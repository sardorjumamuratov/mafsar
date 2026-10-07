import fs from "fs";
let code = fs.readFileSync("src/ui/flows/estimation.js", "utf8");

const qStart = code.indexOf("export function paintEstimationQuestion() {");
const qEnd = code.indexOf("export function submitEstimation() {", qStart);

const newQ = `export function paintEstimationQuestion() {
  const s = estimationState;
  if (!s) return;
  if (s.idx >= s.task.questions.length) return finishEstimation();
  s.step = "answering";
  
  const q = s.task.questions[s.idx];
  const isGuided = s.practiceStyle !== "simulation";
  
  if (!s.working && isGuided && q.scaffold && q.scaffold.length > 0) {
    s.working = q.scaffold.join("\\n");
  }

  let extras = "";
  if (isGuided && q.nudge) {
    extras += \`<div class="st-feedback st-mt16">\${esc(q.nudge)}</div>\`;
  }
  
  if (isGuided && s.dontKnowPressed && q.first_step) {
    extras += \`<div class="st-feedback st-mt16">First step: \${esc(q.first_step)}</div>\`;
  }
  
  if (isGuided && q.traffic) {
    extras += \`
      <div class="st-mt16 st-label">Traffic assumption</div>
      <div class="st-mt4" style="display:flex;gap:8px">
        <button type="button" class="st-pill \${s.trafficAssumption === "average" ? "active" : ""}" data-action="estimation-traffic-average">Average</button>
        <button type="button" class="st-pill \${s.trafficAssumption === "peak" ? "active" : ""}" data-action="estimation-traffic-peak">Peak</button>
      </div>
      \${s.trafficAssumption ? \`<div class="st-note st-mt8">Production systems need headroom above average traffic.</div>\` : ""}
    \`;
  }
  
  const toggleText = s.showWorking ? "Hide rough working" : "Show rough working (optional)";
  
  shellFor(s, {
    body: \`
      \${extras}
      <div class="st-mt24">
        <input type="text" id="estimationValue" class="st-field line" placeholder="e.g. 300 TB, 12k QPS, 2.5 GB/s" aria-label="Your estimate" autocomplete="off" spellcheck="false" value="\${esc(s.lastRaw)}">
        <div class="st-note st-mt4">The right order of magnitude counts.</div>
      </div>
      
      <div class="st-mt24">
        <button type="button" class="st-link" data-action="estimation-toggle-working">\${toggleText}</button>
        \${s.showWorking ? \`<textarea id="estimationWorking" class="st-field h80 st-mt8" placeholder="Rough working...">\${esc(s.working)}</textarea>\` : ""}
      </div>
    \`,
    dock: \`\${secondaryBtn("estimation-dontknow", "Don't know")}\${primaryBtn("estimation-submit", "Check", 'id="estimationCheck" disabled')}\`,
  });
  
  const box = /** @type {HTMLInputElement} */ (document.getElementById("estimationValue"));
  bindField(box, { btn: /** @type {HTMLButtonElement} */ (document.getElementById("estimationCheck")), onSubmit: () => submitEstimation(), enter: true });
  
  const workingBox = /** @type {HTMLTextAreaElement} */ (document.getElementById("estimationWorking"));
  if (workingBox) {
    workingBox.addEventListener("input", () => { s.working = workingBox.value; });
  }
  
  if (!s.showWorking) focusEnd(box);
}

export function estimationAction(action) {
  const s = estimationState;
  if (!s || s.step !== "answering") return;
  const q = s.task.questions[s.idx];

  const raw = document.getElementById("estimationValue")?.value || "";
  s.lastRaw = raw;
  const workingBox = document.getElementById("estimationWorking");
  if (workingBox) s.working = workingBox.value;

  if (action === "dontknow") {
    if (s.practiceStyle !== "simulation" && !s.dontKnowPressed && q.first_step) {
      s.dontKnowPressed = true;
      s.showWorking = true;
      paintEstimationQuestion();
      return;
    }
    grade("", null);
    return;
  }
  if (action === "toggle-working") {
    s.showWorking = !s.showWorking;
    paintEstimationQuestion();
    return;
  }
  if (action === "traffic-average") {
    s.trafficAssumption = "average";
    paintEstimationQuestion();
    return;
  }
  if (action === "traffic-peak") {
    s.trafficAssumption = "peak";
    paintEstimationQuestion();
    return;
  }
}

`;

code = code.substring(0, qStart) + newQ + code.substring(qEnd);
fs.writeFileSync("src/ui/flows/estimation.js", code, "utf8");
