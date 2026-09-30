const fs = require("fs");
let you = fs.readFileSync("src/ui/views/you.js", "utf8");

// Add Teams button to the settings list in renderYou
const teamsRow = `
    <button type="button" class="setting-row" data-action="teams-open">
      <div class="setting-icon">
        <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
      </div>
      <div class="setting-text">
        <div class="setting-title">Teams</div>
        <div class="setting-desc">Collaborate on sets</div>
      </div>
    </button>
`;
you = you.replace('<!-- Settings list -->', '<!-- Settings list -->\n' + teamsRow);
fs.writeFileSync("src/ui/views/you.js", you);

let panel = fs.readFileSync("src/ui/panel.js", "utf8");
panel = panel.replace('case "delete-account-open": renderDeleteAccount(); break;', 'case "delete-account-open": renderDeleteAccount(); break;\n    case "teams-open": renderTeams(); break;');
fs.writeFileSync("src/ui/panel.js", panel);
