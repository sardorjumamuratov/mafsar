const fs = require('fs');
let c = fs.readFileSync('src/ui/nav.js', 'utf8');
c = c.replace(/nav\.classList\.toggle\("hidden", !visible\);/, `nav.classList.toggle("hidden", !visible);
  const dock = document.getElementById("captureDock");
  if (dock) dock.classList.toggle("hidden", !visible);`);
fs.writeFileSync('src/ui/nav.js', c);
