import { esc } from "./core.js";
import { openSheet, closeSheet } from "./sheet.js";

/**
 * A yes/no question on the shared bottom sheet. Resolves true on confirm,
 * false on cancel, Esc or an overlay tap.
 *
 * Laid out like the "Make this set global?" sheet in 03-set-detail.html: the
 * title and body as one block, then the buttons stacked, confirm on top.
 * `detailsHtml` is optional markup between the body and the buttons; the
 * caller escapes what it interpolates.
 */
export function confirmSheet({ title, body, confirmLabel, cancelLabel = "Cancel", destructive = false, detailsHtml = "" }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    openSheet("", `
      <div style="display:flex;flex-direction:column;gap:6px">
        <div id="confirmTitle" style="font-size:18px;font-weight:650">${esc(title)}</div>
        ${body ? `<div style="font-size:14px;line-height:1.45;color:var(--text-body2);text-wrap:pretty">${esc(body)}</div>` : ""}
      </div>
      ${detailsHtml}
      <div style="display:flex;flex-direction:column;gap:8px">
        <button type="button" id="confirmOk" class="sheet-primary${destructive ? " danger" : ""}">${esc(confirmLabel || "OK")}</button>
        <button type="button" id="confirmCancel" class="sheet-quiet">${esc(cancelLabel)}</button>
      </div>`, false, () => finish(false), { px: 22, pb: 24, gap: 16, labelledBy: "confirmTitle" });

    // The sheet focuses its first button, now the confirm one; an Enter on a
    // destructive sheet must not delete, so focus starts on Cancel there.
    if (destructive) document.getElementById("confirmCancel")?.focus();
    document.getElementById("confirmCancel")?.addEventListener("click", () => { finish(false); closeSheet(); });
    document.getElementById("confirmOk")?.addEventListener("click", () => { finish(true); closeSheet(); });
  });
}
