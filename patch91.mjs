import fs from "fs";
let code = fs.readFileSync("src/ui/flows/design.js", "utf8");

code = code.replace(
  'aria-label="${esc(sec.title)}">${esc(s.sections[sec.key] || "")}</textarea>`;',
  'aria-label="${esc(sec.title)}">${esc(s.sections[sec.key] || "")}</textarea>\n      <div style="text-align:center" class="st-mt16"><button type="button" class="st-link" data-action="design-submit">Finish early</button></div>`;'
);

fs.writeFileSync("src/ui/flows/design.js", code, "utf8");
