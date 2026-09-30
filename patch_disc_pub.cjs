const fs = require("fs");
let disc = fs.readFileSync("server/src/discover.ts", "utf8");

disc = disc.replace(
  'if (set.source === "quizlet" || set.source === "anki" || set.source === "shared" || set.is_global) {',
  'if (set.source === "quizlet" || set.source === "anki" || set.source === "shared" || set.is_global || set.origin_set_id) {'
);

fs.writeFileSync("server/src/discover.ts", disc);
