const fs = require("fs");
let c = fs.readFileSync("src/ui/nav.js", "utf8");

c = c.replace(/nav\.querySelectorAll\("button\[data-nav\]"\)\.forEach\(\(b\) => b\.classList\.toggle\("on", \(\/\*\* @type \{any\} \*\/\n\(b\)\)\.dataset\.nav === tab\)\);/, `nav.querySelectorAll("button[data-nav]").forEach((b) => {
    const isActive = b.dataset.nav === tab;
    b.classList.toggle("active", isActive);
    if (isActive) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });`);

fs.writeFileSync("src/ui/nav.js", c);
