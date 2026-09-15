
const fs = require("fs");

let teach = fs.readFileSync("src/storage/teach.js", "utf8");
teach = teach.replace("export function selectTeachCards(cards, isDue = () => false) {", "export function selectTeachCards(cards, isDue = (c) => false) {");
fs.writeFileSync("src/storage/teach.js", teach);

let review = fs.readFileSync("src/ui/flows/review.js", "utf8");
review = review.replace(`import { setCodingState } from "../flows/coding.js";`, `import { setCodingState } from "../flows/coding.js";\nimport { setTeachState } from "./teach.js";`);
fs.writeFileSync("src/ui/flows/review.js", review);

let flowTeach = fs.readFileSync("src/ui/flows/teach.js", "utf8");
flowTeach = flowTeach.replace(`import { isDue } from "../../../shared/srs.js";`, `import { isDue } from "../../storage/srs.js";`);
fs.writeFileSync("src/ui/flows/teach.js", flowTeach);

let panel = fs.readFileSync("src/ui/panel.js", "utf8");
panel = panel.replace(`import { checkCode, codingNext, startCodingPractice } from "./flows/coding.js";`, `import { checkCode, codingNext, startCodingPractice } from "./flows/coding.js";\nimport { startTeach, setTeachPersona, sendTeach, finishTeach } from "./flows/teach.js";`);
fs.writeFileSync("src/ui/panel.js", panel);

