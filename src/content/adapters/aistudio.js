// Google AI Studio adapter (aistudio.google.com).
//
// ⚠ UNVERIFIED: the <ms-chat-turn> / [data-turn-role] selectors below were
// taken second-hand from other open-source tools, NOT read off the live DOM.
// Nobody has confirmed them against aistudio.google.com. Until someone does,
// treat this adapter as provisional — if the selectors are wrong,
// getMessages() returns [] and every capture on this site fails while the
// panel button still advertises support.
//
// makersuite.google.com stays in `matches` but is deliberately absent from
// manifest.json: it 302-redirects to aistudio.google.com, so the browser never
// renders a page there and a host permission for it would widen the install
// warning while buying nothing.
(function () {
  if (!(/** @type {any} */ (window)).__mafsar) return;

  (/** @type {any} */ (window)).__mafsar.register({
    id: "aistudio",
    label: "AI Studio",

    matches: (host) => host.endsWith("aistudio.google.com") || host.endsWith("makersuite.google.com"),

    getMessages() {
      const out = [];

      // Primary: AI Studio uses <ms-chat-turn> wrapping elements.
      // querySelectorAll returns them in document order.
      const nodes = document.querySelectorAll("ms-chat-turn");
      if (nodes.length) {
        nodes.forEach((n) => {
          const userInner = n.querySelector('[data-turn-role="User"]');
          const modelInner = n.querySelector('[data-turn-role="Model"]');
          const roleAttr = n.getAttribute('data-turn-role');
          
          let role = null;
          if (roleAttr === 'User' || userInner) {
            role = "user";
          } else if (roleAttr === 'Model' || modelInner) {
            role = "assistant";
          }

          if (role) {
            const text = ((/** @type {any} */ (n)).innerText || "").trim();
            if (text) out.push({ role, text });
          }
        });
        if (out.length) return out;
      }

      // Fallback: search for elements with role attributes directly
      const fallbackNodes = document.querySelectorAll('[data-turn-role="User"], [data-turn-role="Model"]');
      fallbackNodes.forEach((n) => {
        const attr = n.getAttribute('data-turn-role');
        const role = attr === "User" ? "user" : "assistant";
        const text = ((/** @type {any} */ (n)).innerText || "").trim();
        if (text) out.push({ role, text });
      });

      return out;
    }
  });
})();

