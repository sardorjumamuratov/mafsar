const fs = require("fs");
let y = fs.readFileSync("src/ui/views/you.js", "utf8");

// we'll just add a button in the layout
const teamsHtml = `<button type="button" class="btn" style="width:100%; margin-top: 10px;" data-nav="teams">Teams</button>`;
y = y.replace(/(<div class="del-actions">)/, `${teamsHtml}\n$1`);
// Or better, inject it in the main view
y = y.replace(/(<button class="btn" id="signOutBtn">Sign out<\/button>)/, `<button type="button" class="btn" style="width:100%; margin-bottom: 10px;" data-nav="teams">Teams</button>\n      $1`);

fs.writeFileSync("src/ui/views/you.js", y);
