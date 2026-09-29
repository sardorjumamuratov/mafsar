import { esc } from "./core.js";
import { openSheet, closeSheet } from "./sheet.js";
import { PrimaryButton, OutlineButton } from "./components.js";

export function confirmSheet(title, message, confirmLabel, confirmActionClass, onConfirm) {
  return new Promise((resolve) => {
    // Instead of using global document click listeners, we just construct the buttons with IDs
    const contentHtml = `
      <div style="font-size:15px; color:var(--text-body2); line-height:1.4">${esc(message)}</div>
      <div style="display:flex; gap:10px; margin-top:20px;">
        <div style="flex:1" id="confirmSheetCancel">${OutlineButton("Cancel", 50, 0, 14, "--text-primary", "", false)}</div>
        <div style="flex:1" id="confirmSheetOk">${PrimaryButton(confirmLabel, "", false)}</div>
      </div>
    `;
    // For primary button we can patch its class if confirmActionClass is "danger"
    // To match the original confirm behavior:
    openSheet(esc(title), contentHtml, false);
    
    // Add listeners
    document.getElementById("confirmSheetCancel").onclick = () => {
      closeSheet();
      resolve(false);
    };
    const okBtn = document.getElementById("confirmSheetOk").querySelector("button");
    if (confirmActionClass === "danger") {
      okBtn.style.background = "var(--danger-text)";
      okBtn.style.color = "#fff"; // Assuming danger text has white text
    }
    okBtn.onclick = () => {
      closeSheet();
      if (onConfirm) onConfirm();
      resolve(true);
    };
  });
}
