
import assert from "node:assert";

async function testLinks() {
  const store = await import("../src/storage/store.js");
  
  // mock chrome storage
  global.chrome = {
    storage: {
      local: {
        get: (key, cb) => cb({}),
        set: (obj, cb) => cb()
      }
    }
  };

  const set = {
    sessionId: "test",
    mode: "medicine",
    title: "Asthma",
    chains: [{
      id: "c1",
      steps: [
        { key: "cause", statement: "Allergens" },
        { key: "mechanism", statement: "Inflammation", why: "Triggers." },
        { key: "physiological", statement: "Mucus" } // no why
      ]
    }]
  };

  await store.saveStudySet(set);
  
  // Verify generation
  const cards = set.flashcards;
  assert.strictEqual(cards.length, 2); // 2 links
  
  const link1 = cards.find(c => c.id === "chainlink:c1:cause:mechanism");
  assert.ok(link1);
  assert.ok(link1.front.includes("Cause > Mechanism (Why?)"));
  assert.strictEqual(link1.back, "Triggers.");

  const link2 = cards.find(c => c.id === "chainlink:c1:mechanism:physiological");
  assert.ok(link2);
  assert.ok(link2.front.includes("Inflammation > ?"));
  assert.strictEqual(link2.back, "Mucus");

  // Verify daily cap logic (3 per day max)
  set.chains[0].steps.push(
    { key: "symptoms", statement: "Wheeze" },
    { key: "signs", statement: "Crackles" },
    { key: "tests", statement: "Spiro" },
    { key: "diagnosis", statement: "Asthma" }
  );

  await store.saveStudySet(set);
  const newCards = set.flashcards.filter(c => c.id.startsWith("chainlink:") && !c.deleted);
  assert.strictEqual(newCards.length, 6);
  
  const noDate = newCards.filter(c => !c.dueDate);
  assert.strictEqual(noDate.length, 3); // cap is 3
  
  const hasDate = newCards.filter(c => c.dueDate);
  assert.strictEqual(hasDate.length, 3); // next 3 are scheduled for tomorrow

  // Verify retirement
  set.chains[0].steps.find(s => s.key === "cause").deleted = true;
  await store.saveStudySet(set);
  const retired = set.flashcards.find(c => c.id === "chainlink:c1:cause:mechanism");
  assert.strictEqual(retired.deleted, true);

  console.log("chain links tests passed");
}

testLinks().catch(e => { console.error(e); process.exit(1); });

