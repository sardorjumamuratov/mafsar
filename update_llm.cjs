const fs = require("fs");
let c = fs.readFileSync("server/src/llm.ts", "utf8");
c = c.replace(/"flashcards": \[\{ "front": string, "back": string \}\],/, `"title": string,
    "description": string,
    "flashcards": [{ "front": string, "back": string }],`);

c = c.replace(/if \(flashcards\.length \|\| quiz\.length\) \{/, `
      let title = parsed.title ? String(parsed.title).substring(0, 60) : undefined;
      let description = parsed.description ? String(parsed.description).substring(0, 160) : undefined;
      if (flashcards.length || quiz.length) {`);

c = c.replace(/mode: outMode,/, `mode: outMode,\n          title,\n          description,`);

fs.writeFileSync("server/src/llm.ts", c);
