import assert from "assert";
import { cleanTitle } from "../shared/titles.js";

function test(name, fn) {
  try { fn(); console.log("  \u2713 " + name); }
  catch (e) { console.error("  \u2717 " + name); console.error(e); process.exit(1); }
}

test("cleanTitle", () => {
  assert.equal(cleanTitle("User 9:59 AM What is TCP?"), "What is TCP?");
  assert.equal(cleanTitle("Assistant: Hello"), "Hello");
  assert.equal(cleanTitle("ChatGPT said: Here is"), "Here is");
  assert.equal(cleanTitle("14:02 What is this"), "What is this");
  assert.equal(cleanTitle(""), "Untitled set");
  assert.equal(cleanTitle("   "), "Untitled set");
  assert.equal(cleanTitle("A normal title"), "A normal title");
  assert.equal(cleanTitle("User said: What"), "What");
});
