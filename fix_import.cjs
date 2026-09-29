const fs = require('fs');
let c = fs.readFileSync('src/ui/views/import.js', 'utf8');
c = c.replace(/toast\("Can't reach the server \?" check your connection\."\);/, `toast("Can't reach the server \u2014 check your connection.");`);
c = c.replace(/toast\("That code isn't valid \?" revoked, or check for typos\."\);/, `toast("That code isn't valid \u2014 revoked, or check for typos.");`);
fs.writeFileSync('src/ui/views/import.js', c);
