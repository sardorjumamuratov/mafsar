// Account-deletion rules the panel enforces before calling the server.
// Run: node tests/account.test.mjs
import assert from "node:assert/strict";
import { canConfirmDeletion, deletionErrorMessage, DELETE_CONFIRM_WORD } from "../src/storage/account.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

test("the confirmation word is DELETE", () => {
  assert.equal(DELETE_CONFIRM_WORD, "DELETE");
});

test("requires DELETE typed exactly (surrounding spaces allowed)", () => {
  assert.equal(canConfirmDeletion({ typed: "DELETE", password: "pw", hasPassword: true }), true);
  assert.equal(canConfirmDeletion({ typed: "  DELETE ", password: "pw", hasPassword: true }), true);
  assert.equal(canConfirmDeletion({ typed: "delete", password: "pw", hasPassword: true }), false);
  assert.equal(canConfirmDeletion({ typed: "", password: "pw", hasPassword: true }), false);
});

test("password accounts must enter a password; Google-only accounts don't", () => {
  assert.equal(canConfirmDeletion({ typed: "DELETE", password: "", hasPassword: true }), false);
  assert.equal(canConfirmDeletion({ typed: "DELETE", password: "", hasPassword: false }), true);
});

test("server errors become messages a person can act on", () => {
  assert.equal(deletionErrorMessage({ error: "wrong_password" }, 403), "That password isn't right.");
  assert.match(deletionErrorMessage({ error: "billing_cancel_failed", message: "We couldn't cancel…" }, 502), /couldn't cancel/);
  assert.match(deletionErrorMessage({}, 401), /sign in again/i);
  assert.match(deletionErrorMessage({}, 500), /500/);
});

console.log(`\n${passed} passed`);
