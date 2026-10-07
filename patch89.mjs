import fs from "fs";
let code = fs.readFileSync("server/src/app.ts", "utf8");

code = code.replace(
  'generateDesignTask, gradeDesignAnswer, generateDesignCurveball,',
  'generateDesignTask, gradeDesignAnswer, generateDesignCurveball, generateDesignCheckpoint,'
);

fs.writeFileSync("server/src/app.ts", code, "utf8");
