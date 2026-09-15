const fs = require("fs");
let content = fs.readFileSync("server/src/app.ts", "utf8");
content = content.replace(/console\.error\(e\.stack\);\s*return c\.json\(\{ error: "internal" \}, 500\);/g, `console.error(e.stack);\n      reportError(e, { method: c.req.method, path: c.req.path, userId: c.get("userId") as string | undefined });\n      return c.json({ error: "internal" }, 500);`);
fs.writeFileSync("server/src/app.ts", content);
