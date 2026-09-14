const fs = require("fs");
let s = fs.readFileSync("server/src/app.ts", "utf8");
s = s.replace(
  /import \{ nowISO, one, all, run, uid \} from "\.\/db\.js";/,
  `import { nowISO, one, all, run, uid } from "./db.js";\nimport { retrievability, forgetBy } from "./fsrs.js";`
);
fs.writeFileSync("server/src/app.ts", s);
