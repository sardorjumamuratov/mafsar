
import assert from "node:assert";
import { emptySections, assembleAnswer } from "../src/storage/design.js";

async function run() {
  const clin = emptySections("clinical");
  assert.strictEqual(typeof clin.leading, "string");
  assert.strictEqual(Object.keys(clin).length, 1);
  
  const des = emptySections();
  assert.strictEqual(Object.keys(des).length, 6);
  
  const ans = assembleAnswer({ leading: "Asthma", final: "Inhaler" }, "clinical");
  assert.ok(ans.includes("Leading diagnosis & why:\nAsthma"));
  assert.ok(ans.includes("Final diagnosis & management:\nInhaler"));
  
  console.log("clinical cases tests passed");
}

run().catch(e => { console.error(e); process.exit(1); });

