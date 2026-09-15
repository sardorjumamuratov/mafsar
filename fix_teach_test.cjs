
const fs = require("fs");
let content = fs.readFileSync("server/tests/teach-routes.test.ts", "utf8");
content = content.replace("for (let i = 0; i < 21; i++)", "for (let i = 0; i < 151; i++)");
content = content.replace("expect(codes[20]).toBe(429);", "expect(codes[150]).toBe(429);");
fs.writeFileSync("server/tests/teach-routes.test.ts", content);

