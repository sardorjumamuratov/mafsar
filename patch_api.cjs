const fs = require("fs");
let api = fs.readFileSync("src/sync/api.js", "utf8");

const inject = `
export async function backendLookupRatings(ids) {
  const req = await fetchApi("/v1/ratings/lookup", { method: "POST", body: JSON.stringify({ ids }) });
  return await req.json();
}
export async function backendSendRating(id, stars) {
  const req = await fetchApi("/v1/sets/" + encodeURIComponent(id) + "/rating", { method: "PUT", body: JSON.stringify({ stars }) });
  if (!req.ok) throw new Error("Couldn't save rating");
  return await req.json();
}
export async function backendDeleteRating(id) {
  const req = await fetchApi("/v1/sets/" + encodeURIComponent(id) + "/rating", { method: "DELETE" });
  if (!req.ok) throw new Error("Couldn't delete rating");
  return await req.json();
}
`;

api = api + inject;
fs.writeFileSync("src/sync/api.js", api);
