// Run on the Mafsar landing page to handle "Add to Mafsar" for shared sets.
const run = () => {
  const installedView = document.getElementById("ext-installed-view");
  const notInstalledView = document.getElementById("ext-not-installed-view");
  const addBtn = document.getElementById("add-to-mafsar-btn");
  const statusEl = document.getElementById("add-status");
  
  if (installedView && notInstalledView && addBtn) {
    // Show installed view
    installedView.style.display = "block";
    notInstalledView.style.display = "none";
    
    let targetBtn = addBtn;
    if (targetBtn.dataset.bound) {
      targetBtn = addBtn.cloneNode(true);
      addBtn.parentNode.replaceChild(targetBtn, addBtn);
    }
    targetBtn.dataset.bound = "true";
    targetBtn.addEventListener("click", () => {
      const code = targetBtn.dataset.code;
      if (!code) return;
      
      (/** @type {any} */ (targetBtn)).disabled = true;
      targetBtn.textContent = "Adding...";
      if (statusEl) statusEl.textContent = "";
      
      // Message background worker to import the set
      chrome.runtime.sendMessage({ type: "LANDING_IMPORT_SHARE", code }, (resp) => {
        if (chrome.runtime.lastError || (resp && !resp.ok)) {
          (/** @type {any} */ (targetBtn)).disabled = false;
          targetBtn.textContent = "Add to Mafsar";
          if (statusEl) {
            statusEl.textContent = chrome.runtime.lastError?.message || resp?.error || "Failed to add set.";
            statusEl.style.color = "var(--ember)";
          }
        } else {
          targetBtn.textContent = "Added to your sets!";
          targetBtn.style.background = "var(--success)";
          if (statusEl) {
            statusEl.textContent = "Open the Mafsar extension to review it.";
            statusEl.style.color = "var(--success)";
          }
        }
      });
    });
  }
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", run);
} else {
  run();
}

// Observe mutations in case it's rendered dynamically
const observer = new MutationObserver(() => {
  if (document.getElementById("ext-installed-view") && document.getElementById("ext-installed-view").style.display === "none") {
    run();
  }
});
observer.observe(document.body, { childList: true, subtree: true });
