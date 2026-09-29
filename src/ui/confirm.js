import { esc } from "./core.js";

export function confirmSheet({ title, body, confirmLabel, destructive }) {
  return new Promise((resolve) => {
    let sheet = document.getElementById("sheet");
    if (!sheet) {
      sheet = document.createElement("div");
      sheet.id = "sheet";
      sheet.className = "bottom-sheet";
      document.body.appendChild(sheet);
    }
    
    sheet.innerHTML = `
      <div class="sheet-panel">
        <div class="sheet-grabber"></div>
        <div class="sheet-title">${esc(title)}</div>
        <div class="sheet-content info-sheet">
          <div style="font-size:15px; color:var(--text-secondary); line-height:1.45">${esc(body || "")}</div>
          <div style="display:flex; gap:8px; margin-top:8px">
            <button id="confirmCancel" class="btn-ghost" style="flex:1">${esc(cancelLabel)}</button>
            <button id="confirmOk" class="btn-primary ${destructive ? 'btn-danger' : ''}" style="flex:1">${esc(confirmLabel || "OK")}</button>
          </div>
        </div>
      </div>
    `;
    sheet.classList.remove("hidden");
    
    document.getElementById("confirmCancel").onclick = () => {
      sheet.classList.add("hidden");
      resolve(false);
    };
    document.getElementById("confirmOk").onclick = () => {
      sheet.classList.add("hidden");
      resolve(true);
    };
  });
}
