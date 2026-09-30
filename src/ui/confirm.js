import { esc } from "./core.js";
import { openSheet, closeSheet } from "./sheet.js";

/**
 * A yes/no question on the shared bottom sheet. Resolves true on confirm,
 * false on cancel, Esc or an overlay tap.
 */
export function confirmSheet({ title, body, confirmLabel, cancelLabel = "Cancel", destructive = false }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    openSheet(esc(title), `
      <div style="font-size:15px; color:var(--text-secondary); line-height:1.45">${esc(body || "")}</div>
      <div style="display:flex; gap:8px; margin-top:8px">
        <button type="button" id="confirmCancel" class="btn btn-ghost" style="flex:1">${esc(cancelLabel)}</button>
        <button type="button" id="confirmOk" class="btn btn-primary ${destructive ? "btn-danger" : ""}" style="flex:1">${esc(confirmLabel || "OK")}</button>
      </div>`, false, () => finish(false));

    document.getElementById("confirmCancel")?.addEventListener("click", () => { finish(false); closeSheet(); });
    document.getElementById("confirmOk")?.addEventListener("click", () => { finish(true); closeSheet(); });
  });
}
