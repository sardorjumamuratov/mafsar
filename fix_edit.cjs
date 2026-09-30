const fs = require("fs");
let detail = fs.readFileSync("src/ui/views/set-detail.js", "utf8");
detail = detail.replace(/export function setEditingCardId\(v\) \{ editingCardId = v; \}/, `export function setEditingCardId(v) { 
  editingCardId = v;
  const dock = document.getElementById("captureDock");
  if (dock) {
    if (v) dock.classList.add("hidden");
    else dock.classList.remove("hidden");
  }
}`);
fs.writeFileSync("src/ui/views/set-detail.js", detail);
