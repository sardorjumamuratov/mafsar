
const fs = require("fs");
const blocks = require("./extracted.json");

// set-detail.js
let setDetail = fs.readFileSync("src/ui/views/set-detail.js", "utf8");
setDetail = setDetail.replace(
  `      \${studySet.mode === "coding"`,
  blocks["src/ui/views/set-detail.js"][0].trim() + `\n      \${studySet.mode === "coding"`
);
fs.writeFileSync("src/ui/views/set-detail.js", setDetail);

// review.js
let review = fs.readFileSync("src/ui/flows/review.js", "utf8");
review = review.replace(`import { setCodingState } from "./coding.js";`, `import { setCodingState } from "./coding.js";\nimport { setTeachState } from "./teach.js";`);
review = review.replace(`setCodingState(null);`, `setCodingState(null);\n  setTeachState(null);`);
fs.writeFileSync("src/ui/flows/review.js", review);

