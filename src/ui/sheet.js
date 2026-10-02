import { setHTML } from "./core.js";

// Whatever had focus before the sheet opened, so closing can hand it back.
let previousFocus = null;
// Called once when the sheet closes by Esc or an overlay tap (a confirm sheet
// resolves "no" through it).
let onDismiss = null;

function sheetEl() {
  let sheet = document.getElementById("sheet");
  if (!sheet) {
    sheet = document.createElement("div");
    sheet.id = "sheet";
    sheet.className = "sheet hidden";
    document.body.appendChild(sheet);
  }
  if (!sheet.dataset.wired) {
    sheet.dataset.wired = "1";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    sheet.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); dismiss(); return; }
      if (e.key !== "Tab") return;
      // Keep Tab inside the sheet.
      const items = focusables(sheet);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    // A tap on the overlay (the sheet itself, not its panel) closes it.
    sheet.addEventListener("click", (e) => {
      if (e.target === sheet) dismiss();
    });
  }
  return sheet;
}

function focusables(root) {
  return /** @type {HTMLElement[]} */ ([...root.querySelectorAll('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]);
}

function dismiss() {
  const cb = onDismiss;
  onDismiss = null;
  closeSheet();
  cb?.();
}

/**
 * Open the shared bottom sheet. `titleHtml` and `contentHtml` are markup: the
 * caller escapes every interpolated value, as with setHTML.
 *
 * `opts` takes the reference sheet's spacing: `px` and `pb` (side and bottom
 * padding), `gap` between blocks, and `maxHeight` (a CSS length). `labelledBy`
 * names an element inside the content that titles it, for sheets that draw
 * their own heading.
 */
export function openSheet(titleHtml, contentHtml, isList = false, dismissed = null, opts = {}) {
  previousFocus = document.activeElement;
  onDismiss = dismissed;
  const sheet = sheetEl();
  // Numbers only, so nothing from the caller reaches the style attribute raw.
  const px = Number(opts.px ?? 16), pb = Number(opts.pb ?? 24), gap = Number(opts.gap ?? 14);
  const max = /^\d+(%|px|vh)$/.test(opts.maxHeight || "") ? opts.maxHeight : "90%";
  setHTML(sheet, `
    <div class="sheet-panel" style="--sheet-px:${px}px;--sheet-pb:${pb}px;--sheet-gap:${gap}px;--sheet-max:${max}">
      <div class="sheet-grabber"></div>
      ${titleHtml ? `<div class="sheet-title" id="sheetTitle">${titleHtml}</div>` : ""}
      <div class="sheet-content ${isList ? "list-sheet" : "info-sheet"}">
        ${contentHtml}
      </div>
    </div>`);
  const label = titleHtml ? "sheetTitle" : opts.labelledBy;
  if (label) sheet.setAttribute("aria-labelledby", label);
  else sheet.removeAttribute("aria-labelledby");
  sheet.classList.remove("hidden");

  const items = focusables(sheet);
  if (items.length) items[0].focus();
  else sheet.focus();
}

export function closeSheet() {
  const sheet = document.getElementById("sheet");
  if (sheet) {
    sheet.classList.add("hidden");
    sheet.replaceChildren();
  }
  onDismiss = null;
  if (previousFocus && previousFocus.isConnected) previousFocus.focus();
  previousFocus = null;
}
