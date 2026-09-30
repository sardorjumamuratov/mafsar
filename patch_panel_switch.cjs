const fs = require("fs");
let panel = fs.readFileSync("src/ui/panel.js", "utf8");

const cases = `
    case "global-tab": setGlobalTab((/** @type {any} */ (t)).dataset.tab); break;
    case "global-preview": previewGlobal(id); break;
    case "global-open-added": openAdded(id); break;
    case "global-add-set": addGlobal(id); break;
    case "global-report": reportGlobal(id); break;
    case "global-unpublish": unpublishGlobal(id); break;
    case "global-publish": publishGlobal(id); break;
`;

if (!panel.includes('case "global-preview"')) {
  panel = panel.replace('case "export-backup": exportBackup(); break;', 'case "export-backup": exportBackup(); break;\n' + cases);
}

// Remove the failed `if (act ===` patch if it's there
panel = panel.replace(/if \(act === "global-tab"\) return setGlobalTab\(t.dataset.tab\);[\s\S]*?if \(act === "global-publish"\) return publishGlobal\(id\);/g, '');

fs.writeFileSync("src/ui/panel.js", panel);
