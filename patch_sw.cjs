const fs = require("fs");
let sw = fs.readFileSync("src/background/service-worker.js", "utf8");

// Add imports
sw = sw.replace(
  'backendGlobalAdd } from "../sync/api.js";',
  'backendGlobalAdd, backendSendFeedback, backendGlobalPreview } from "../sync/api.js";'
);

// Add cases
const cases = `
    case "SYNC_PULL_SET":
      return await backendGlobalAdd(req.id);
    case "SEND_FEEDBACK":
      return await backendSendFeedback(req.text, req.imageData, req.appVersion, req.platform, req.route);
`;
sw = sw.replace('switch (req.type) {', 'switch (req.type) {' + cases);

fs.writeFileSync("src/background/service-worker.js", sw);
