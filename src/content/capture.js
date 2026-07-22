// Content script: injects a "Save conversation" button and reads the chat via
// the matching site adapter. Sends captured sessions to the service worker.
(function () {
  const mafsar = window.__mafsar;
  if (!mafsar) return;

  const adapter = mafsar.pick();
  if (!adapter) return; // not a supported site

  const BTN_ID = "mafsar-save-btn";

  function captureSession() {
    const messages = adapter.getMessages();
    if (!messages.length) {
      return { ok: false, error: "Couldn't read this page — no conversation found." };
    }
    const session = {
      source: adapter.id,
      sourceLabel: adapter.label,
      title: (adapter.getTitle && adapter.getTitle()) || "Untitled conversation",
      url: location.href,
      capturedAt: Date.now(),
      messages,
    };
    return { ok: true, session };
  }

  function flash(button, text, ok = true) {
    const original = button.textContent;
    button.textContent = text;
    button.classList.toggle("mafsar-err", !ok);
    setTimeout(() => {
      button.textContent = original;
      button.classList.remove("mafsar-err");
    }, 2200);
  }

  function onSaveClick(e) {
    const button = e.currentTarget;
    const result = captureSession();
    if (!result.ok) {
      flash(button, "⚠ Nothing to save", false);
      return;
    }
    chrome.runtime.sendMessage(
      { type: "SAVE_SESSION", payload: result.session },
      (resp) => {
        if (chrome.runtime.lastError || !resp || !resp.ok) {
          flash(button, "⚠ Save failed", false);
          return;
        }
        flash(button, `✓ Saved (${result.session.messages.length} msgs)`);
      }
    );
  }

  function injectButton() {
    if (document.getElementById(BTN_ID)) return;
    const btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.textContent = "📚 Save to Mafsar";
    btn.title = "Capture this conversation as a Mafsar study session";
    btn.addEventListener("click", onSaveClick);
    document.body.appendChild(btn);
  }

  // Re-inject if the SPA re-renders and drops our button.
  injectButton();
  const mo = new MutationObserver(() => injectButton());
  mo.observe(document.body, { childList: true, subtree: false });

  // Allow the side panel to trigger a capture of the active tab.
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === "CAPTURE_ACTIVE") {
      sendResponse(captureSession());
    }
    return true;
  });
})();
