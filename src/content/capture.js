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
      button.textContent = button.dataset.label;
      button.classList.remove("mafsar-err", "mafsar-busy");
      button.disabled = false;
    }, 2600);
  }

  function onSaveClick(e) {
    const button = e.currentTarget;
    const result = captureSession();
    if (!result.ok) {
      flash(button, "⚠ Nothing to save", false);
      return;
    }
    // Save + auto-generate flashcards and a quiz in one action.
    button.disabled = true;
    button.classList.add("mafsar-busy");
    button.textContent = "Saving & generating…";
    chrome.runtime.sendMessage(
      { type: "SAVE_AND_GENERATE", payload: result.session },
      (resp) => {
        if (chrome.runtime.lastError || !resp || !resp.ok) {
          flash(button, "⚠ Save failed", false);
          return;
        }
        if (resp.generated) {
          flash(button, `✓ Study set ready · ${resp.cards} cards`);
        } else if (resp.reason === "no-key") {
          flash(button, "✓ Saved — add API key to generate", false);
        } else {
          flash(button, "✓ Saved — generation failed", false);
        }
      }
    );
  }

  function injectButton() {
    if (document.getElementById(BTN_ID)) return;
    const btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.dataset.label = "📚 Save to Mafsar";
    btn.textContent = btn.dataset.label;
    btn.title = "Save this conversation and generate flashcards + a quiz";
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
