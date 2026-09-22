
import assert from "node:assert";
import { renderArchitecture } from "../src/storage/bottleneck.js";

function testRenderArchitecture() {
  const comps = ["Client", "CDN", "API (3x)", "Postgres primary"];
  const out = renderArchitecture(comps);
  const expected = "Client\n? CDN\n  ? API (3x)\n    ? Postgres primary";
  assert.strictEqual(out, expected);
}

testRenderArchitecture();
console.log("bottleneck tests passed");

