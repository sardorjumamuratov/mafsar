const fs = require("fs");
let code = fs.readFileSync("src/ui/views/set-detail.js", "utf8");

code += `
export async function publishGlobalSet(id) {
  try {
    const res = await send({ type: "GLOBAL_PUBLISH", setId: id });
    if (res.error) throw new Error(res.error);
    await renderSetDetail(id, detail.tab);
  } catch (e) {
    alert(e.message);
  }
}

export async function unpublishGlobalSet(id) {
  try {
    const res = await send({ type: "GLOBAL_UNPUBLISH", setId: id });
    if (res.error) throw new Error(res.error);
    await renderSetDetail(id, detail.tab);
  } catch (e) {
    alert(e.message);
  }
}
`;
fs.writeFileSync("src/ui/views/set-detail.js", code);
