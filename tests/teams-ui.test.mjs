// Pure helpers for team links and codes (Teams tab + team detail). DOM wiring
// is pinned by tests/ui-static.test.mjs; here only the link math runs.
// Run: node tests/teams-ui.test.mjs

import assert from "node:assert/strict";
import { teamLinkFor, parseTeamCode, parseShareCode } from "../src/ui/share-link.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("teamLinkFor(code, base)");

test("joins base and code over the /t/ path", () => {
  assert.equal(teamLinkFor("K4RW7M", "https://mafsar.app"), "https://mafsar.app/t/K4RW7M");
});

test("trims whitespace around the code and trailing slashes off the base", () => {
  assert.equal(teamLinkFor(" K4RW7M ", "https://mafsar.app/"), "https://mafsar.app/t/K4RW7M");
});

test("empty base still produces a rooted /t/ path", () => {
  assert.equal(teamLinkFor("K4RW7M", ""), "/t/K4RW7M");
});

console.log("parseTeamCode(urlOrCode)");

test("parses a code back out of a full /t/{code} URL", () => {
  assert.equal(parseTeamCode("https://mafsar.app/t/K4RW7M"), "K4RW7M");
  assert.equal(parseTeamCode("https://mafsar.app/t/k4rw7m?x=1"), "K4RW7M");
});

test("parses a bare code and uppercases it", () => {
  assert.equal(parseTeamCode("k4rw7m"), "K4RW7M");
  assert.equal(parseTeamCode("  k4rw7m "), "K4RW7M");
});

test("empty or missing input yields an empty string", () => {
  assert.equal(parseTeamCode(""), "");
  assert.equal(parseTeamCode(null), "");
});

test("share (/s/) and team (/t/) links do not parse as each other's codes", () => {
  // A share link pasted into the team join box falls through to the raw string
  // (no /t/ segment) — which the server rejects as an unknown team code.
  const fromShareLink = parseTeamCode("https://mafsar.app/s/7KX2M9QRTA");
  assert.ok(!/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/.test(fromShareLink), "no 6-char code extracted from a /s/ link");
  // A team link pasted into the share box keeps its URL shape (not a bare code).
  const fromTeamLink = parseShareCode("https://mafsar.app/t/K4RW7M");
  assert.ok(!/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/.test(fromTeamLink), "no 6-char code extracted from a /t/ link");
});

console.log(`\n${passed} tests passed`);
