global.document = {
  getElementById: () => ({ addEventListener: () => {} }),
  querySelectorAll: () => [],
  addEventListener: () => {}
};
global.window = {
  addEventListener: () => {}
};
global.chrome = {
  storage: { local: { get: async () => ({}), set: async () => {} } },
  runtime: { onMessage: { addListener: () => {} } }
};
import("./src/ui/panel.js").then(() => console.log("Success")).catch(e => console.error(e));
