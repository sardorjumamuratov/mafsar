const fs = require("fs");

function patch(file) {
  let code = fs.readFileSync(file, "utf8");
  code = code.replace('import { activeTab } from "../nav.js";', 'import { activeTab } from "../nav.js";\nimport { getRating, renderMetaSuffix, requestRatingsLookup } from "../../storage/ratings.js";');
  code = code.replace('import { FLAME, bundle, esc, sourceLabel } from "../core.js";', 'import { FLAME, bundle, esc, sourceLabel } from "../core.js";\nimport { getRating, renderMetaSuffix, requestRatingsLookup } from "../../storage/ratings.js";');
  
  if (code.includes('requestRatingsLookup')) {
    // replace `sourceLabel(s)}</span>`
    code = code.replace(/\$\{esc\(sourceLabel\(s\)\)\}<\/span>/g, `\${esc(sourceLabel(s))}</span>\${renderMetaSuffix(getRating(s.originSetId || s.id))}`);
    
    // add requestRatingsLookup
    const idsExtract = 'const { sessions } = await bundle();';
    const idsInject = 'const { sessions } = await bundle();\n  requestRatingsLookup(sessions.map(s => s.id));';
    code = code.replace(idsExtract, idsInject);
  }
  fs.writeFileSync(file, code);
}

patch("src/ui/views/sets.js");
patch("src/ui/views/home.js");
