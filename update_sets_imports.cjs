const fs = require("fs");
let c = fs.readFileSync("src/ui/views/sets.js", "utf8");

c = c.replace(/import \{ SetRow, BottomSheet, SectionLabel, PrimaryButton, IconButton \} from "\.\.\/components\.js";/, `import { SectionLabel, PrimaryButton, IconButton } from "../components.js";
import { SetRow } from "../set-row.js";
import { BottomSheet } from "../sheet.js";`);

c = c.replace(/import \{ setNav \} from "\.\.\/nav\.js";/, `import { setNav, showChrome } from "../nav.js";`);
c = c.replace(/window\._searchTimer/g, 'window["_searchTimer"]');
c = c.replace(/e\.target\.value/g, 'e.target["value"]');
c = c.replace(/e\.currentTarget\.style/g, 'e.currentTarget["style"]');
c = c.replace(/e\.currentTarget\.dataset/g, 'e.currentTarget["dataset"]');
c = c.replace(/e\.key/g, 'e["key"]');

fs.writeFileSync("src/ui/views/sets.js", c);

let h = fs.readFileSync("src/ui/views/home.js", "utf8");
h = h.replace(/import \{ setRow \} from "\.\.\/views\/sets\.js";/, 'import { SetRow as setRow } from "../set-row.js";');
fs.writeFileSync("src/ui/views/home.js", h);
