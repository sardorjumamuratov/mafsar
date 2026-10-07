import fs from "fs";
let code = fs.readFileSync("src/ui/flows/shell.js", "utf8");

code = code.replace(
  '${icon("loader", 20, 2, "st-spin")}',
  '<span class="st-spin">${icon("loader", 20, 2)}</span>'
);

code = code.replace(
  'const addBtn = document.getElementById("sugg-add");',
  'const addBtn = /** @type {HTMLButtonElement} */ (document.getElementById("sugg-add"));'
);

code = code.replace(
  'const checkboxes = Array.from(document.querySelectorAll(\'input[data-sugg-idx]\'));',
  'const checkboxes = /** @type {HTMLInputElement[]} */ (Array.from(document.querySelectorAll(\'input[data-sugg-idx]\')));'
);

fs.writeFileSync("src/ui/flows/shell.js", code, "utf8");
