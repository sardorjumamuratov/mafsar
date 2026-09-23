// Link cards built from mechanism chains. Run: node tests/chain-links.test.mjs
import assert from "node:assert/strict";
import { LINK_PREFIX, MAX_NEW_LINKS_PER_DAY, buildLinkCards, isLinkCard, linkId, syncLinkCards } from "../src/storage/chain-links.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const DAY = 86_400_000;
const NOW = Date.parse("2026-09-23T09:00:00.000Z");
const step = (key, statement, why = "") => ({ id: `s-${key}`, key, statement, why });
const medicineSet = (steps, extra = {}) => ({
  sessionId: "sess1",
  mode: "medicine",
  title: "Respiratory",
  chains: [{ id: "ch1", template: "medicine-condition", title: "Asthma", steps }],
  flashcards: [],
  ...extra,
});

console.log("building");
test("one card per arrow between consecutive filled steps", () => {
  const links = buildLinkCards(medicineSet([
    step("cause", "Allergen"),
    step("mechanism", "Airway inflammation", "The trigger activates immune cells."),
  ]));
  assert.equal(links.length, 1);
  assert.equal(links[0].id, linkId("ch1", "cause", "mechanism"));
  assert.match(links[0].front, /Respiratory · Asthma · Cause → Mechanism/);
  assert.match(links[0].front, /Why does/, "with a why in the source, ask why");
  assert.equal(links[0].back, "The trigger activates immune cells.");
});

test("without a why, the card asks for the next step", () => {
  const [link] = buildLinkCards(medicineSet([step("cause", "Allergen"), step("mechanism", "Inflammation")]));
  assert.match(link.front, /Allergen → \?/);
  assert.equal(link.back, "Inflammation");
});

test("a gap breaks the chain: no card jumps over it", () => {
  const links = buildLinkCards(medicineSet([step("cause", "Allergen"), step("tests", "Spirometry")]));
  assert.deepEqual(links, [], "cause and tests are not consecutive");
});

test("no card text carries a broken character", () => {
  for (const l of buildLinkCards(medicineSet([step("cause", "A"), step("mechanism", "B", "because")]))) {
    assert.ok(!l.front.includes("�") && !l.back.includes("�"));
  }
});

console.log("keeping cards in step with the chain");
test("cards are added for new links and ids are stable across rebuilds", () => {
  const set = medicineSet([step("cause", "Allergen"), step("mechanism", "Inflammation")]);
  set.flashcards = syncLinkCards(set, { now: NOW });
  assert.equal(set.flashcards.length, 1);
  const first = set.flashcards[0];
  set.flashcards = syncLinkCards(set, { now: NOW + DAY });
  assert.equal(set.flashcards.length, 1, "no duplicate on a second pass");
  assert.equal(set.flashcards[0].id, first.id);
});

test("only the first few new cards are due today; the rest are spread over days", () => {
  const keys = ["cause", "mechanism", "physiological", "symptoms", "signs", "tests", "diagnosis", "treatment"];
  const set = medicineSet(keys.map((k, i) => step(k, `step ${i}`)));
  const cards = syncLinkCards(set, { now: NOW });
  assert.equal(cards.length, 7);
  const today = cards.filter((c) => c.dueDate <= NOW).length;
  assert.equal(today, MAX_NEW_LINKS_PER_DAY);
  assert.ok(cards.every((c) => typeof c.dueDate === "number"), "epoch ms, like every other card");
  assert.equal(cards.filter((c) => c.dueDate > NOW + DAY).length, 1, "the eighth link waits two days");
});

test("editing the answer resets the schedule; rewording the question doesn't", () => {
  const set = medicineSet([step("cause", "Allergen"), step("mechanism", "Inflammation", "Immune cells react.")]);
  set.flashcards = syncLinkCards(set, { now: NOW });
  Object.assign(set.flashcards[0], { repetitions: 3, interval: 12, stability: 9, dueDate: NOW + 12 * DAY });

  set.chains[0].steps[0].statement = "Allergen."; // a tweak to the question side
  set.flashcards = syncLinkCards(set, { now: NOW });
  assert.equal(set.flashcards[0].repetitions, 3, "schedule kept");

  set.chains[0].steps[1].why = "Mast cells release histamine.";
  set.flashcards = syncLinkCards(set, { now: NOW });
  assert.equal(set.flashcards[0].repetitions, 0, "new answer: learn it again");
  assert.equal(set.flashcards[0].stability, undefined);
});

test("links whose steps are gone are tombstoned, and come back if the step returns", () => {
  const set = medicineSet([step("cause", "Allergen"), step("mechanism", "Inflammation")]);
  set.flashcards = syncLinkCards(set, { now: NOW });
  set.chains[0].steps[0].deleted = true;
  set.flashcards = syncLinkCards(set, { now: NOW });
  assert.equal(set.flashcards[0].deleted, true);
  delete set.chains[0].steps[0].deleted;
  set.flashcards = syncLinkCards(set, { now: NOW });
  assert.equal(set.flashcards[0].deleted, false);
});

test("ordinary cards and non-medicine sets are left alone", () => {
  const set = medicineSet([step("cause", "Allergen"), step("mechanism", "Inflammation")]);
  set.flashcards = [{ id: "plain", front: "Q", back: "A" }];
  const cards = syncLinkCards(set, { now: NOW });
  assert.equal(cards.find((c) => c.id === "plain").front, "Q");
  const general = { ...set, mode: "general", flashcards: [{ id: "plain", front: "Q", back: "A" }] };
  assert.deepEqual(syncLinkCards(general, { now: NOW }).map((c) => c.id), ["plain"]);
});

test("link cards are recognisable by id", () => {
  assert.ok(isLinkCard({ id: linkId("ch1", "cause", "mechanism") }));
  assert.ok(linkId("ch1", "a", "b").startsWith(LINK_PREFIX));
  assert.ok(!isLinkCard({ id: "plain" }));
  assert.ok(!isLinkCard(null));
});

console.log(`\n${passed} passed`);
