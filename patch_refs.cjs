const fs = require("fs");
let api = fs.readFileSync("src/sync/api.js", "utf8");
api = api.replace(/fetchApi/g, 'authedFetch');
fs.writeFileSync("src/sync/api.js", api);

let panel = fs.readFileSync("src/ui/panel.js", "utf8");
// Did I import rateSet?
if (!panel.includes('rateSet')) {
  console.log("Adding rateSet import to panel.js");
}
