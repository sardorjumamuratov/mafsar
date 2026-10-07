import fs from "fs";
let code = fs.readFileSync("src/ui/flows/estimation.js", "utf8");

code = code.replace("  });\n});\n}", "  });\n}");
code = code.replace("  });\r\n});\r\n}", "  });\r\n}");
code = code.replace(/  \}\);\r?\n\}\);\r?\n\}/, "  });\n}");

fs.writeFileSync("src/ui/flows/estimation.js", code, "utf8");
