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
    
    addBtn.addEventListener("click", () => {
      const code = addBtn.dataset.code;
      if (!code) return;
      
      addBtn.disabled = true;
      addBtn.textContent = "Adding...";
      if (statusEl) statusEl.textContent = "";
      
      // Message background worker to import the set
      chrome.runtime.sendMessage({ type: "LANDING_IMPORT_SHARE", code }, (resp) => {
        if (chrome.runtime.lastError || (resp && !resp.ok)) {
          addBtn.disabled = false;
          addBtn.textContent = "Add to Mafsar";
          if (statusEl) {
            statusEl.textContent = chrome.runtime.lastError?.message || resp?.error || "Failed to add set.";
            statusEl.style.color = "var(--ember)";
          }
        } else {
          addBtn.textContent = "Added to your sets!";
          addBtn.style.background = "var(--success)";
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
