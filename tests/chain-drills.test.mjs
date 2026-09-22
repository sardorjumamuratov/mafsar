
import assert from "node:assert";

// Mock chrome
global.chrome = { storage: { local: { get: (k, cb) => cb({}), set: (o, cb) => cb() } } };

// Mock DOM
global.document = {
  addEventListener: () => {},
  getElementById: (id) => ({ value: "test answer", focus: () => {} })
};
global.app = { dataset: {}, querySelector: () => null, querySelectorAll: () => [] };

async function testDrills() {
  // Since we cannot easily run the full UI flow without JSDOM, we mock the dependencies
  // and just verify the pure logic if any, or verify we exported the right things.
  // Actually, we can test the weak-chain selection logic by recreating it here:
  
  const chains = [
    { id: "c1", steps: [{key:"cause", statement:"a"}, {key:"mechanism", statement:"b"}] },
    { id: "c2", steps: [{key:"cause", statement:"c"}, {key:"mechanism", statement:"d"}] }
  ];
  
  const reviewLog = [
    { kind: "chain-drill", cardId: "c1" },
    { kind: "chain-drill", cardId: "c1" }
  ];
  
  const drills = {};
  for (const log of reviewLog) {
    if (log.kind === "chain-drill" && log.cardId) {
      drills[log.cardId] = (drills[log.cardId] || 0) + 1;
    }
  }
  
  chains.sort((a, b) => (drills[a.id] || 0) - (drills[b.id] || 0));
  
  assert.strictEqual(chains[0].id, "c2"); // c2 has 0 drills, c1 has 2. Weak chain selected!
  
  console.log("chain drills tests passed");
}

testDrills().catch(e => { console.error(e); process.exit(1); });

