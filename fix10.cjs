const fs = require("fs");
let content = fs.readFileSync("tests/ui-static.test.mjs", "utf8");
const testCode = `test("the You tab offers account deletion, wired end to end", () => {
  const read = (p) => fs.readFileSync(join(__dirname, p), "utf8").replace(/\\r\\n/g, "\\n");
  assert.ok(read("../src/ui/views/you.js").includes(\`data-action="delete-account-open"\`), "You tab needs a Delete account button");
  const panel = read("../src/ui/panel.js");
  assert.ok(panel.includes(\`case "delete-account-open"\`) && panel.includes(\`case "delete-account-confirm"\`), "panel.js must handle both actions");
  const view = read("../src/ui/views/delete-account.js");
  assert.ok(view.includes("canConfirmDeletion"), "the confirm button must be gated by canConfirmDeletion");
  const sw = read("../src/background/service-worker.js");
  const branch = sw.slice(sw.indexOf(\`case "DELETE_ACCOUNT"\`), sw.indexOf(\`case "DELETE_ACCOUNT"\`) + 600);
  assert.ok(branch.includes("chrome.storage.local.clear()"), "after deleting, the worker must erase local data");
});\n\n`;
content = content.replace(`console.log("\\n" + passed + " passed");`, testCode + `console.log("\\n" + passed + " passed");`);
fs.writeFileSync("tests/ui-static.test.mjs", content);
