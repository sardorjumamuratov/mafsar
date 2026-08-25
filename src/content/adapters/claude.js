// Claude adapter (claude.ai).
// DOM is site-specific and changes over time — keep this file small and isolated.
(function () {
  if (!(/** @type {any} */ (window)).__mafsar) return;

  (/** @type {any} */ (window)).__mafsar.register({
    id: "claude",
    label: "Claude",

    matches: (host) => host.endsWith("claude.ai"),

    getMessages() {
      // Claude marks turns with data-testid "user-message" and renders assistant
      // turns in .font-claude-message (class names drift; this is the fragile bit).
      const out = [];
      const nodes = document.querySelectorAll(
        '[data-testid="user-message"], [data-testid="assistant-message"], .font-claude-message'
      );
      nodes.forEach((el) => {
        const testid = el.getAttribute("data-testid") || "";
        let role;
        if (testid === "user-message") role = "user";
        else if (testid === "assistant-message" || el.classList.contains("font-claude-message"))
          role = "assistant";
        else return;
        const text = ((/** @type {any} */ (el)).innerText || "").trim();
        if (!text) return;
        out.push({ role, text });
      });
      return out;
    },

    getTitle() {
      const active = document.querySelector('[data-testid="menu-item"][data-active="true"]');
      const t = ((/** @type {any} */ (active))?.innerText || "").trim();
      return t || (document.title || "Claude conversation").replace(/\s*[-—|].*$/, "").trim();
    },
  });
})();
