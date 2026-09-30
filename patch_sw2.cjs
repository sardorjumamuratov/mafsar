const fs = require("fs");
let sw = fs.readFileSync("src/background/service-worker.js", "utf8");

sw = sw.replace('backendGlobalPreview', '');

const cases = `
    case "SYNC_PULL_SET":
      return await backendGlobalAdd(msg.id);
    case "SEND_FEEDBACK":
      return await backendSendFeedback(msg.text, msg.imageData, msg.route, msg.appVersion, msg.platform);
`;
if (!sw.includes('case "SYNC_PULL_SET"')) {
  sw = sw.replace('switch (msg?.type) {', 'switch (msg?.type) {' + cases);
}
fs.writeFileSync("src/background/service-worker.js", sw);
