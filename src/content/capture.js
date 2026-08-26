// Content script: injects the Mafsar action buttons and reads the chat via the
// matching site adapter. Sends captured sessions to the service worker.
//
// Two capture modes share the adapter's message list:
//   "Save chat"        - the whole conversation (the original behaviour)
//   "Save last answer" - only the most recent answer, plus the question that
//                        produced it (see src/storage/last-answer.js)
(function () {
  const mafsar = (/** @type {any} */ (window)).__mafsar;
  if (!mafsar) return;

  const adapter = mafsar.pick();
  if (!adapter) return; // not a supported site

  const lastAnswer = (/** @type {any} */ (window)).__mafsarLastAnswer;

  const WRAP_ID = "mafsar-actions";
  const BTN_ID = "mafsar-save-btn";
  const ANSWER_BTN_ID = "mafsar-answer-btn";

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
      captureMode: "conversation",
      messages,
    };
    return { ok: true, session };
  }

  /**
   * `isGenerating` is optional on the adapter contract, and its selectors track
   * site DOM that drifts. Anything other than a confident `true` means "go
   * ahead" — a stale selector must not turn into a button that never works.
   */
  function isGenerating() {
    try {
      return typeof adapter.isGenerating === "function" && adapter.isGenerating() === true;
    } catch {
      return false;
    }
  }

  function captureLastAnswerSession() {
    if (!lastAnswer) {
      return { ok: false, error: "Mafsar couldn't load — reload the page." };
    }
    if (isGenerating()) {
      return { ok: false, error: "Still writing — wait for it to finish." };
    }

    const result = lastAnswer.extractLastAnswer(adapter.getMessages());
    if (!result.ok) {
      return {
        ok: false,
        error:
          result.reason === "no-answer"
            ? "No answer to save yet."
            : "That answer's too short to make cards from.",
      };
    }

    const session = {
      source: adapter.id,
      sourceLabel: adapter.label,
      title: result.title || "Saved answer",
      url: location.href,
      capturedAt: Date.now(),
      captureMode: "answer",
      messages: lastAnswer.answerMessages(result.question, result.answer),
    };
    return { ok: true, session };
  }

  function flash(button, text, ok = true) {
    button.textContent = text;
    button.classList.toggle("mafsar-err", !ok);
    setTimeout(() => {
      button.textContent = button.dataset.label;
      button.classList.remove("mafsar-err", "mafsar-busy");
      button.disabled = false;
    }, 2600);
  }

  /**
   * Shared click path for both buttons: capture, then save + generate.
   * @param {HTMLButtonElement} button
   * @param {() => {ok:boolean, session?:any, error?:string}} capture
   * @param {string} busyText
   */
  function runCapture(button, capture, busyText) {
    const result = capture();
    if (!result.ok) {
      // Every refusal here is local — nothing has been sent, so no quota spent.
      flash(button, "⚠ " + result.error, false);
      return;
    }
    button.disabled = true;
    button.classList.add("mafsar-busy");
    button.textContent = busyText;
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

  function onSaveClick(e) {
    runCapture(e.currentTarget, captureSession, "Saving & generating…");
  }

  function onSaveAnswerClick(e) {
    runCapture(e.currentTarget, captureLastAnswerSession, "Saving answer…");
  }

  /**
   * @param {string} id
   * @param {string} label
   * @param {string} title
   * @param {(e:any)=>void} onClick
   */
  function makeButton(id, label, title, onClick) {
    const btn = document.createElement("button");
    btn.id = id;
    btn.type = "button";
    btn.dataset.label = label;
    btn.textContent = label;
    btn.title = title;
    btn.addEventListener("click", onClick);
    return btn;
  }

  const RUNTIME_EXEC_ID = Math.random().toString(36);

  function injectButtons() {
    const existing = document.getElementById(WRAP_ID);
    if (existing) {
      if (existing.dataset.execId === RUNTIME_EXEC_ID) return;
      existing.remove(); // Replace orphaned buttons from a previous extension version
    }
    const wrap = document.createElement("div");
    wrap.id = WRAP_ID;
    wrap.dataset.execId = RUNTIME_EXEC_ID;
    wrap.appendChild(
      makeButton(
        ANSWER_BTN_ID,
        "✨ Save last answer",
        "Make flashcards from just the most recent answer",
        onSaveAnswerClick
      )
    );
    wrap.appendChild(
      makeButton(
        BTN_ID,
        "📚 Save chat",
        "Save this whole conversation and generate flashcards + a quiz",
        onSaveClick
      )
    );
    document.body.appendChild(wrap);
  }

  // Re-inject if the SPA re-renders and drops our container.
  injectButtons();
  const mo = new MutationObserver(() => injectButtons());
  mo.observe(document.body, { childList: true, subtree: false });

  // Allow the side panel to trigger a capture of the active tab.
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === "CAPTURE_ACTIVE") {
      sendResponse(captureSession());
    } else if (msg && msg.type === "CAPTURE_LAST_ANSWER") {
      sendResponse(captureLastAnswerSession());
    } else if (msg && msg.type === "MAFSAR_PING") {
      // Lets the panel show its "Capture last answer" button only where an
      // answer can exist. No reply at all (non-chat tab) reads as "hide it".
      sendResponse({ ok: true, site: adapter.label });
    }
    return true;
  });
})();
