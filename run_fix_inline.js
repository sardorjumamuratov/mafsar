const fs = require('fs');
let code = fs.readFileSync('src/ui/panel.js', 'utf8');

code = code.replace(
  'Waiting for Google... <button class="btn btn-ghost" style="margin-left:auto;padding:2px 8px;font-size:12px;min-height:0" onclick="event.stopPropagation();this.parentElement.click()">Cancel</button>',
  'Waiting for Google... <button class="btn btn-ghost" style="margin-left:auto;padding:2px 8px;font-size:12px;min-height:0" data-action="auth-google-cancel">Cancel</button>'
);

// Add the auth-google-cancel case to the dispatcher
code = code.replace(
  /case "auth-google": authGoogle\(t\); break;/,
  `case "auth-google": authGoogle(t); break;
      case "auth-google-cancel":
        if (googleAbortController) {
          googleAbortController.abort();
          googleAbortController = null;
          const auth = await getAuth();
          if (auth?.user) renderYou();
          else renderAuthGate();
        }
        break;`
);

fs.writeFileSync('src/ui/panel.js', code);
