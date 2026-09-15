
const fs = require("fs");
const blocks = require("./extracted.json");

// 3a
fs.writeFileSync("src/storage/teach.js", blocks["src/storage/teach.js"][0].trim() + "\n");

// 3b
let api = fs.readFileSync("src/sync/api.js", "utf8");
api = api.replace("export async function backendGradeCode(", blocks["src/sync/api.js"][0].trim() + "\n\nexport async function backendGradeCode(");
fs.writeFileSync("src/sync/api.js", api);

// 3c
let sw = fs.readFileSync("src/background/service-worker.js", "utf8");
sw = sw.replace("import { backendDeleteAccount } from \"../sync/api.js\";", "import { backendDeleteAccount, backendTeachTurn, backendEvaluateTeaching } from \"../sync/api.js\";");
sw = sw.replace("case \"DELETE_ACCOUNT\":\n      return await backendDeleteAccount(payload.token);", "case \"DELETE_ACCOUNT\":\n      return await backendDeleteAccount(payload.token);\n\n" + blocks["src/background/service-worker.js"][0].trim());
fs.writeFileSync("src/background/service-worker.js", sw);

// 3d
fs.writeFileSync("src/ui/flows/teach.js", blocks["src/ui/flows/teach.js"][0].trim() + "\n");

// 3e
let setDetail = fs.readFileSync("src/ui/views/set-detail.js", "utf8");
setDetail = setDetail.replace(
  `<button class="btn btn-primary" data-action="review-all" style="flex: 1">`,
  blocks["src/ui/views/set-detail.js"][0].trim() + `\n      <button class="btn btn-primary" data-action="review-all" style="flex: 1">`
);
fs.writeFileSync("src/ui/views/set-detail.js", setDetail);

// 3f: ui/panel.js
let panel = fs.readFileSync("src/ui/panel.js", "utf8");
panel = panel.replace("import { reviewStart } from \"./flows/review.js\";", "import { reviewStart } from \"./flows/review.js\";\nimport { teachStart, teachSend, teachPersona, teachHint, teachFinish } from \"./flows/teach.js\";");
panel = panel.replace(
  `    case "review-start":\n      reviewStart(t.closest("[data-set-id]").dataset.setId, t.dataset.cardId);\n      break;`,
  `    case "review-start":\n      reviewStart(t.closest("[data-set-id]").dataset.setId, t.dataset.cardId);\n      break;\n` + blocks["src/ui/panel.js"][0].trim()
);
fs.writeFileSync("src/ui/panel.js", panel);

// 3g: panel.css
let css = fs.readFileSync("src/ui/panel.css", "utf8");
css += "\n\n" + blocks["src/ui/panel.css"].join("\n\n");
fs.writeFileSync("src/ui/panel.css", css);

console.log("Extension step 3 done");

