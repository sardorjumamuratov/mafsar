const fs = require("fs");
let detail = fs.readFileSync("src/ui/views/set-detail.js", "utf8");

detail = detail.replace('import { shareBlockHtml } from "../share.js";', 'import { shareBlockHtml } from "../share.js";\nimport { getRating, renderStarsGroup } from "../../storage/ratings.js";');

const target = '<div><div class="h-title" style="line-height:1.25">${esc(session.title || "Untitled")}</div>';
const replacement = '<div><div class="h-title" style="line-height:1.25">${esc(session.title || "Untitled")}</div>\n        ${renderStarsGroup(studySet.originSetId || session.id, session.id, getRating(studySet.originSetId || session.id), false)}';

detail = detail.replace(target, replacement);
fs.writeFileSync("src/ui/views/set-detail.js", detail);
