import { app, esc } from "./core.js";

// Keep a reference to whatever had focus before we opened
let previousFocus = null;

export function openSheet(titleHtml, contentHtml, isList = false) {
  previousFocus = document.activeElement;
  
  let sheet = document.getElementById("sheet");
  if (!sheet) {
    sheet = document.createElement("div");
    sheet.id = "sheet";
    sheet.className = "bottom-sheet";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    document.body.appendChild(sheet);
    
    // trap focus simple version
    sheet.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeSheet();
    });
    // Overlay click
    sheet.addEventListener("click", (e) => {
      if (e.target === sheet) closeSheet();
    });
  }
  
  sheet.innerHTML = `
    <div class="sheet-panel">
      <div class="sheet-grabber"></div>
      ${titleHtml ? `<div class="sheet-title" id="sheetTitle">${titleHtml}</div>` : ""}
      <div class="sheet-content ${isList ? "list-sheet" : "info-sheet"}">
        ${contentHtml}
      </div>
    </div>
  `;
  if (titleHtml) sheet.setAttribute("aria-labelledby", "sheetTitle");
  sheet.classList.remove("hidden");
  
  // Focus trap
  const focusable = sheet.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (focusable.length) (/** @type {HTMLElement} */ (focusable[0])).focus();
  else sheet.focus();
}

export function closeSheet() {
  const sheet = document.getElementById("sheet");
  if (sheet) {
    sheet.classList.add("hidden");
    sheet.innerHTML = "";
  }
  if (previousFocus) previousFocus.focus();
}
