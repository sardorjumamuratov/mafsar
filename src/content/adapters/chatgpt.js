// ChatGPT adapter (chatgpt.com / chat.openai.com).
// DOM is site-specific and changes over time — keep this file small and isolated
// so a breakage here is a one-file fix.
(function () {
  if (!(/** @type {any} */ (window)).__mafsar) return;

  (/** @type {any} */ (window)).__mafsar.register({
    id: "chatgpt",
    label: "ChatGPT",

    matches: (host) => host.endsWith("chatgpt.com") || host.endsWith("chat.openai.com"),

    getMessages() {
      // ChatGPT tags each turn with data-message-author-role ("user" | "assistant").
      const turns = document.querySelectorAll("[data-message-author-role]");
      const out = [];
      turns.forEach((el) => {
        const role = el.getAttribute("data-message-author-role");
        const text = ((/** @type {any} */ (el)).innerText || "").trim();
        if (!text) return;
        if (role !== "user" && role !== "assistant") return;
        out.push({ role, text });
      });
      return out;
    },

    getTitle() {
      // Active item in the sidebar, falling back to the document title.
      const active =
        document.querySelector('nav a[aria-current="page"]') ||
        document.querySelector('nav [data-active="true"]');
      const t = ((/** @type {any} */ (active))?.innerText || "").trim();
      return t || (document.title || "ChatGPT conversation").replace(/\s*[-—|].*$/, "").trim();
    },
  });
})();
