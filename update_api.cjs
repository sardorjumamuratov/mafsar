const fs = require('fs');
let c = fs.readFileSync('src/sync/api.js', 'utf8');

c += `
export function backendGlobalPublish(setId) {
  return post("/v1/global/publish", { setId });
}
export function backendGlobalUnpublish(setId) {
  return post("/v1/global/unpublish", { setId });
}
export function backendGlobalList(q, category, page) {
  return get("/v1/global/discover?q=" + encodeURIComponent(q || "") + "&category=" + encodeURIComponent(category || "") + "&page=" + page);
}
export function backendGlobalFetch(id) {
  return get("/v1/global/set/" + encodeURIComponent(id));
}
export function backendGlobalReport(id) {
  return post("/v1/global/report", { setId: id });
}
`;

fs.writeFileSync('src/sync/api.js', c);
