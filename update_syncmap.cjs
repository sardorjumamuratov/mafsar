const fs = require("fs");
let c = fs.readFileSync("shared/sync-map.js", "utf8");

c = c.replace(/sourceLabel: se\.sourceLabel \?\? null,/, `sourceLabel: se.sourceLabel ?? null,\n          description: st.description ?? se.description ?? null,`);
c = c.replace(/source: r\.source \?\? undefined,/, `source: r.source ?? undefined,\n        description: r.description ?? undefined,`);

fs.writeFileSync("shared/sync-map.js", c);
