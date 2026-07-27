// Google Gemini adapter (gemini.google.com — the consumer chat app).
// DOM is site-specific and changes over time — keep this file small and isolated.
(function () {
  if (!window.__mafsar) return;

  window.__mafsar.register({
    id: "gemini",
    label: "Gemini",

    matches: (host) => host.endsWith("gemini.google.com"),

    getMessages() {
      const out = [];

      // Gemini uses custom elements: <user-query> and <model-response>.
      // Selecting both together keeps them in document (conversation) order.
      const nodes = document.querySelectorAll("user-query, model-response");
      nodes.forEach((n) => {
        const role = n.tagName.toLowerCase() === "user-query" ? "user" : "assistant";
        const text = (n.innerText || "").trim();
        if (text) out.push({ role, text });
      });
      if (out.length) return out;

      // Fallback: iterate conversation containers and pull query/response text.
      document.querySelectorAll(".conversation-container").forEach((c) => {
        const u = c.querySelector(".query-text, user-query");
        const a = c.querySelector(".model-response-text, message-content, model-response");
        const ut = (u?.innerText || "").trim();
        const at = (a?.innerText || "").trim();
        if (ut) out.push({ role: "user", text: ut });
        if (at) out.push({ role: "assistant", text: at });
      });
      return out;
    },

    getTitle() {
      const active = document.querySelector(
        '[data-test-id="conversation"].selected, .conversation.selected .conversation-title'
      );
      const t = (active?.innerText || "").trim();
      return t || (document.title || "Gemini conversation").replace(/\s*[-—|].*$/, "").trim();
    },
  });
})();
