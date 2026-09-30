const fs = require("fs");
let detail = fs.readFileSync("src/ui/views/set-detail.js", "utf8");

// find end of paintDetail to add event listeners
const addEvents = `
  } else if (tab === "chains") {
`;

const eventsCode = `
      // Attach edit listeners
      setTimeout(() => {
        const front = document.getElementById("editFront");
        const back = document.getElementById("editBack");
        const save = document.getElementById("editSaveBtn");
        if (front && back && save) {
          const update = () => { save.disabled = !front.value.trim() || !back.value.trim(); };
          front.addEventListener("input", update);
          back.addEventListener("input", update);
          update();
          const onKey = (e) => {
            if (e.key === "Escape") { document.querySelector('[data-action="edit-cancel"]')?.click(); }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { save.click(); }
          };
          front.addEventListener("keydown", onKey);
          back.addEventListener("keydown", onKey);
          front.focus();
        }
      }, 0);
  } else if (tab === "chains") {
`;

detail = detail.replace(addEvents, eventsCode);
fs.writeFileSync("src/ui/views/set-detail.js", detail);
