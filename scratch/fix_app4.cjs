const fs = require("fs");
let s = fs.readFileSync("server/src/app.ts", "utf8");
s = s.replace(/\[userId, accessToken, refreshToken, user\.email, state\]/, "[user.id, accessToken, refreshToken, user.email, state]");
fs.writeFileSync("server/src/app.ts", s);
