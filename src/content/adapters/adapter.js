// Shared adapter registry for content scripts.
// Content scripts can't use ES module imports, so adapters attach to a global.
// Each site adapter registers itself; capture.js picks the one matching the host.
(function () {
  if ((/** @type {any} */ (window)).__mafsar) return;

  const registry = [];

  (/** @type {any} */ (window)).__mafsar = {
    /**
     * Register a site adapter.
     * @param {Object} adapter
     * @param {string} adapter.id            - unique id, e.g. "chatgpt"
     * @param {string} adapter.label         - human name
     * @param {(host:string)=>boolean} adapter.matches
     * @param {()=>{role:string,text:string}[]} adapter.getMessages
     * @param {()=>string} [adapter.getTitle]
     * @param {()=>boolean} [adapter.isGenerating] - true while a reply is still
     *   streaming. Optional: callers must treat a missing (or throwing) method
     *   as "not generating" so a stale selector degrades to a cosmetic gap
     *   rather than a dead button.
     */
    register(adapter) {
      registry.push(adapter);
    },

    /**
     * An element's visible text without the names of its icon glyphs.
     *
     * Google's apps draw icons with Material Symbols: a button's text node is
     * literally "edit" or "more_vert", and a ligature font renders it as a
     * picture. innerText can't tell the difference, so reading a whole chat
     * turn drags those names in — and the question became the set title
     * "edit more_vert".
     *
     * Drops only lines made entirely of this element's own icon names, so a
     * sentence that happens to contain "edit" survives, and innerText's line
     * breaks (paragraphs, code) are kept. src/storage/last-answer.js has a name-list
     * backstop for text that never passed through here.
     * @param {Element|null|undefined} el
     * @returns {string}
     */
    readText(el) {
      const raw = String((/** @type {any} */ (el))?.innerText || "").trim();
      if (!raw || !el) return raw;
      const ICON_SELECTOR =
        'mat-icon, .material-icons, .google-symbols, [class*="material-symbols"], [class*="material-icons"]';
      const icons = new Set();
      el.querySelectorAll(ICON_SELECTOR).forEach((i) => {
        const name = (i.textContent || "").trim();
        // Glyph names are lowercase identifiers; anything else is real text.
        if (/^[a-z][a-z0-9_]*$/.test(name)) icons.add(name);
      });
      if (!icons.size) return raw;
      return raw
        .split("\n")
        .filter((line) => {
          const tokens = line.trim().split(/\s+/).filter(Boolean);
          return !(tokens.length && tokens.every((t) => icons.has(t)));
        })
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    },

    /** Return the first adapter matching the current host, or null. */
    pick(host = location.hostname) {
      return registry.find((a) => {
        try {
          return a.matches(host);
        } catch {
          return false;
        }
      }) || null;
    },
  };
})();
