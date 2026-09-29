const fs = require("fs");
let y = fs.readFileSync("src/ui/views/you.js", "utf8");
y = y.replace(/<button class="btn btn-ghost btn-block" data-action="auth-signout">Sign out<\/button>/, `<button type="button" class="btn btn-ghost btn-block" data-action="nav-teams">Teams</button>\n          <button class="btn btn-ghost btn-block" data-action="auth-signout">Sign out</button>`);
fs.writeFileSync("src/ui/views/you.js", y);
