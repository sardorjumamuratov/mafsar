// In-panel confirmation sheet. Replaces window.confirm(), which ignores the
// panel's theme and is unreliable inside Firefox's sidebar.
import { esc, setHTML } from "./core.js";

/** @type {((ok: boolean) => void) | null} */
let finishOpen = null;

/**
 * @param {{ title: string, body?: string, confirmLabel: string, cancelLabel?: string, destructive?: boolean }} opts
 * @returns {Promise<boolean>} true only when the user confirms
 */
export function confirmSheet({ title, body = "", confirmLabel, cancelLabel = "Cancel", destructive = false }) {
  if (finishOpen) finishOpen(false);
  const host = sheetHost();
  const active = /** @type {HTMLElement|null} */ (document.activeElement);
  // Opened from a menu item? That item is hidden by the time we close, so return
  // focus to the button that owns the menu instead.
  const opener = /** @type {HTMLElement|null} */ (active?.closest(".menu-wrap")?.querySelector("[aria-haspopup]") || active);
  setHTML(host, `
    <div class="sheet-backdrop" data-sheet="cancel"></div>
    <div class="sheet-box" role="dialog" aria-modal="true" aria-labelledby="sheetTitle"${body ? ' aria-describedby="sheetBody"' : ""}>
      <div class="sheet-title" id="sheetTitle">${esc(title)}</div>
      ${body ? `<p class="sheet-body" id="sheetBody">${esc(body)}</p>` : ""}
      <div class="sheet-actions">
        <button type="button" class="btn btn-ghost" data-sheet="cancel">${esc(cancelLabel)}</button>
        <button type="button" class="btn btn-primary${destructive ? " btn-danger" : ""}" data-sheet="ok">${esc(confirmLabel)}</button>
      </div>
    </div>`);
  host.classList.remove("hidden");

  return new Promise((resolve) => {
    const buttons = /** @type {HTMLElement[]} */ ([...host.querySelectorAll("button")]);
    const finish = (/** @type {boolean} */ ok) => {
      document.removeEventListener("keydown", onKey, true);
      host.removeEventListener("click", onClick);
      host.classList.add("hidden");
      host.replaceChildren();
      finishOpen = null;
      if (opener?.isConnected) opener.focus();
      resolve(ok);
    };
    const onClick = (/** @type {MouseEvent} */ e) => {
      const kind = /** @type {HTMLElement} */ (e.target).closest("[data-sheet]")?.getAttribute("data-sheet");
      if (kind) finish(kind === "ok");
    };
    const onKey = (/** @type {KeyboardEvent} */ e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        finish(false);
      } else if (e.key === "Tab") {
        // Keep focus inside the sheet.
        const i = buttons.indexOf(/** @type {HTMLElement} */ (document.activeElement));
        const next = e.shiftKey ? (i <= 0 ? buttons.length - 1 : i - 1) : (i + 1) % buttons.length;
        e.preventDefault();
        buttons[next].focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    host.addEventListener("click", onClick);
    finishOpen = finish;
    // Cancel gets focus, so Enter never destroys anything by accident.
    buttons[0].focus();
  });
}

/** The sheet container from panel.html, created on demand if a page lacks it. */
function sheetHost() {
  let host = document.getElementById("sheet");
  if (!host) {
    host = document.createElement("div");
    host.id = "sheet";
    host.className = "sheet hidden";
    document.body.append(host);
  }
  return host;
}
