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
     */
    register(adapter) {
      registry.push(adapter);
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
