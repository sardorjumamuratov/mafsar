const fs = require('fs');
let c = fs.readFileSync('src/background/service-worker.js', 'utf8');

const newRoutes = `
    case "GLOBAL_PUBLISH":
      return await authedFetch("/v1/global/publish", { method: "POST", body: JSON.stringify({ setId: msg.setId }) });
    case "GLOBAL_UNPUBLISH":
      return await authedFetch("/v1/global/unpublish", { method: "POST", body: JSON.stringify({ setId: msg.setId }) });
    case "GLOBAL_LIST":
      return await authedFetch("/v1/global/discover?q=" + encodeURIComponent(msg.q || "") + "&category=" + encodeURIComponent(msg.category || "") + "&page=" + msg.page);
    case "GLOBAL_FETCH":
      return await authedFetch("/v1/global/set/" + encodeURIComponent(msg.id));
    case "GLOBAL_REPORT":
      return await authedFetch("/v1/global/report", { method: "POST", body: JSON.stringify({ setId: msg.id }) });
`;

c = c.replace(/case "SHARE_FETCH": \{/, newRoutes + `\n    case "SHARE_FETCH": {`);

fs.writeFileSync('src/background/service-worker.js', c);
