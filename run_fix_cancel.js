const fs = require('fs');
let code = fs.readFileSync('src/ui/panel.js', 'utf8');

code = code.replace(
  /case "auth-google-cancel":[\s\S]*?break;/,
  `case "auth-google-cancel":
        if (googleAbortController) googleAbortController.abort();
        break;`
);

fs.writeFileSync('src/ui/panel.js', code);
