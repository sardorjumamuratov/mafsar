import fs from "fs";
let code = fs.readFileSync("src/ui/flows/estimation.js", "utf8");

code = code.replace(
  'lastRaw: "",',
  'lastRaw: "",\n    working: "",\n    dontKnowPressed: false,\n    showWorking: style === "guided",\n    trafficAssumption: null,'
);

// We should also clear working when advancing to next question.
// Wait, finishEstimation is for the round, nextQuestion is for the next.
// Where is nextQuestion called?
