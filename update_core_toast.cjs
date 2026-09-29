const fs = require("fs");
let c = fs.readFileSync("src/ui/core.js", "utf8");

const oldToast = `export function toast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), 3000);
}`;

const newToast = `
let toastTimer = null;
export function toast(msg, { action, onAction } = {}) {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.setAttribute("role", "status");
    t.setAttribute("aria-live", "polite");
    document.body.appendChild(t);
  }
  
  const actionHtml = action ? \`<button type="button" class="toast-action">\${esc(action)}</button>\` : "";
  t.innerHTML = \`<span class="toast-msg">\${esc(msg)}</span>\${actionHtml}\`;
  
  if (action && onAction) {
    t.querySelector(".toast-action").onclick = () => {
      t.classList.add("hidden");
      onAction();
    };
  }
  
  t.classList.remove("hidden");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 4000);
}`;

c = c.replace(/export function toast[\s\S]*?3000\);\n\}/, newToast);
fs.writeFileSync("src/ui/core.js", c);
