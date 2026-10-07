import fs from "fs";
let code = fs.readFileSync("src/ui/flows/estimation.js", "utf8");

// Add diagnoseEstimation import
if (!code.includes("import { diagnoseEstimation }")) {
  code = code.replace(
    'import { gradeEstimation, mismatchNote, parseEstimation, parseReference } from "../../storage/estimation.js";',
    'import { gradeEstimation, mismatchNote, parseEstimation, parseReference } from "../../storage/estimation.js";\nimport { diagnoseEstimation } from "../../storage/estimation-diagnose.js";'
  );
}

// Update VERDICT and KIND
code = code.replace(
  'const KIND = { spot_on: "ok", ballpark: "part", off: "no" };',
  'const KIND = { spot_on: "ok", ballpark: "part", off: "no", unit_mismatch: "no" };'
);
code = code.replace(
  'off: "Not quite",\n};',
  'off: "Not quite",\n  unit_mismatch: "Unit mismatch",\n};'
);

// Update grade to use diagnoseEstimation
const gradeOld = `function grade(raw, parsed) {
  const s = estimationState;
  const q = s.task.questions[s.idx];
  let result = "off";
  let note = "";
  if (parsed) {
    // A reference unit we can't read is compared as the same kind as the answer.
    const ref = parseReference(q.reference_value, q.reference_unit) || { value: Number(q.reference_value), kind: parsed.kind };
    result = gradeEstimation(ref, parsed);
    note = mismatchNote(ref, parsed);
  }
  s.results.push({ question: q, raw, grade: result, note });`;

const gradeNew = `function grade(raw, parsed) {
  const s = estimationState;
  const q = s.task.questions[s.idx];
  let result = "off";
  let note = "";
  let diagnosis = null;
  if (parsed) {
    // A reference unit we can't read is compared as the same kind as the answer.
    const ref = parseReference(q.reference_value, q.reference_unit) || { value: Number(q.reference_value), kind: parsed.kind };
    result = gradeEstimation(ref, parsed);
    note = mismatchNote(ref, parsed);
    
    if (result !== "spot_on" && result !== "unit_mismatch") {
       diagnosis = diagnoseEstimation(parsed.value, ref.value, s.trafficAssumption !== null || !!q.traffic);
    }
  }
  s.results.push({ question: q, raw, grade: result, note, diagnosis, working: s.working });`;

code = code.replace(gradeOld, gradeNew);

// Update paintEstimationChecked
code = code.replace(
  '<div class="st-steps">',
  '${r.diagnosis ? `<div class="st-feedback st-mt16">${esc(r.diagnosis)}</div>` : ""}\n      <div class="st-steps">'
);

fs.writeFileSync("src/ui/flows/estimation.js", code, "utf8");
