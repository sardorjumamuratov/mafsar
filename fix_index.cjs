const fs = require("fs");
let content = fs.readFileSync("server/src/index.ts", "utf8");
content = content.replace(
  `import { createApp } from "./app.js";`,
  `import { createApp } from "./app.js";\nimport { initSentry } from "./observability.js";`
);
content = content.replace(
  `const db = openDB();`,
  `await initSentry(); // no-op unless SENTRY_DSN is set\n\nconst db = openDB();`
);
fs.writeFileSync("server/src/index.ts", content);
