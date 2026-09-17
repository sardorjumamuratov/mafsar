import { esc } from "./core.js";

let teardown = null;

export function showSheet(title, message, confirmText, isDanger, onConfirm) {
  const overlay = document.getElementById("sheet-overlay");
  const box = document.getElementById("sheet-box");
  const titleEl = document.getElementById("sheet-title");
  const msgEl = document.getElementById("sheet-msg");
  const cancelBtn = document.getElementById("sheet-cancel");
  const confirmBtn = document.getElementById("sheet-confirm");

  titleEl.textContent = title;
  msgEl.textContent = message;
  confirmBtn.textContent = confirmText;
  confirmBtn.className = isDanger ? "btn btn-primary btn-danger" : "btn btn-primary";

  const close = () => {
    overlay.classList.add("hidden");
    if (teardown) {
      document.removeEventListener("keydown", teardown);
      teardown = null;
    }
  };

  const handleKey = (e) => {
    if (e.key === "Escape") close();
  };

  document.addEventListener("keydown", handleKey);
  teardown = handleKey;

  overlay.onclick = (e) => {
    if (e.target === overlay || e.target === cancelBtn) close();
  };

  confirmBtn.onclick = () => {
    close();
    onConfirm();
  };

  overlay.classList.remove("hidden");
  confirmBtn.focus();
}

