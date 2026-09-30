const fs = require("fs");
let detail = fs.readFileSync("src/ui/views/set-detail.js", "utf8");

detail = detail.replace(
  'if (src === "quizlet" || src === "anki" || src === "shared" || src === "global") {',
  'if (src === "quizlet" || src === "anki" || src === "shared" || src === "global" || studySet.originSetId) {'
);

fs.writeFileSync("src/ui/views/set-detail.js", detail);
