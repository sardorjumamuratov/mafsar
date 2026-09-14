const fs = require("fs");
let s = fs.readFileSync("server/src/app.ts", "utf8");
s = s.replace(
  `const user = c.get("user");`,
  `const userId = c.get("userId") as string;`
);
s = s.replace(
  /user\.id/g,
  `userId`
);
fs.writeFileSync("server/src/app.ts", s);
