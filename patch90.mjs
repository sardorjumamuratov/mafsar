import fs from "fs";
let code = fs.readFileSync("src/background/service-worker.js", "utf8");

const checkpointRoute = `
    case "DESIGN_CHECKPOINT": {
      callApi("design-checkpoint", { step: msg.step, brief: msg.brief, answer: msg.answer })
        .then((res) => sendResponse({ ok: true, ...res }))
        .catch((e) => sendResponse({ ok: false, error: e.message }));
      return true;
    }
`;

code = code.replace(
  '    case "DESIGN_CURVEBALL": {',
  checkpointRoute + '    case "DESIGN_CURVEBALL": {'
);

fs.writeFileSync("src/background/service-worker.js", code, "utf8");
