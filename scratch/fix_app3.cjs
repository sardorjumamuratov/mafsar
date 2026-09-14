const fs = require("fs");
let s = fs.readFileSync("server/src/app.ts", "utf8");
s = s.replace(/signAccessToken\(userId\)/g, "signAccessToken(user.id)");
s = s.replace(/signRefreshToken\(userId\)/g, "signRefreshToken(user.id)");
s = s.replace(/user: \{ id: userId, email: user.email \}/g, "user: { id: user.id, email: user.email }");
fs.writeFileSync("server/src/app.ts", s);
