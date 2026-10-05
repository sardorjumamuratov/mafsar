// Editing a card happens in the row itself (the prompt that replaces Prompt 6):
// the question and answer become textareas in their own positions, Edit/Delete
// become Cancel/Save, and nothing else moves. Static checks here; the 0px
// geometry is measured in the harness.
// Run: node tests/edit-in-place.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
let failures = 0;
function test(name, fn) {
  try { fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); }
}

const detail = read("src/ui/views/set-detail.js");
const css = read("src/ui/panel.css");
const panel = read("src/ui/panel.js");
const confirm = read("src/ui/confirm.js");
const editor = detail.slice(detail.indexOf("// One card row, read-only or editing."), detail.indexOf("export async function paintDetail("));

test("the row renderer exists", () => assert.ok(editor.length > 500));

test("the old editor component is gone: no labels, no accent-bordered box, no Done", () => {
  assert.doesNotMatch(detail, /function renderEditor\(/);
  assert.doesNotMatch(editor, />Question</);
  assert.doesNotMatch(editor, />Answer</);
  assert.doesNotMatch(editor, /border:1px solid var\(--accent\)/);
  assert.doesNotMatch(editor, />Done</);
});

test("the question textarea sits on the read-only text's pixels", () => {
  assert.match(editor, /class="edit-q[^"]*"[^>]*placeholder="Question"/);
  assert.match(editor, /margin:-4px -8px;padding:4px 8px/);
  assert.match(editor, /font-size:15px;line-height:1\.4/);
});

test("the answer textarea takes the panel's own box", () => {
  assert.match(editor, /class="edit-a[^"]*"[^>]*placeholder="Answer"/);
  assert.match(editor, /padding:10px 12px;border:0;border-radius:10px;background:var\(--bg-surface\)/);
});

test("outlined with box-shadow, teal on focus, auto-growing", () => {
  assert.match(editor, /box-shadow:inset 0 0 0 1px var\(--border-control\)/);
  assert.match(css, /\.edit-q:focus,\s*\.edit-a:focus\s*\{[^}]*box-shadow:\s*inset 0 0 0 1px var\(--accent\)/);
  assert.match(css, /field-sizing:\s*content/);
  assert.match(css, /\.edit-q::placeholder,\s*\.edit-a::placeholder\s*\{[^}]*var\(--status-new\)/);
});

test("the chevron becomes a 16px spacer and the header stops toggling", () => {
  assert.match(editor, /<span class="chev-spacer" style="width:16px;height:16px;margin-top:3px;flex-shrink:0"/);
  assert.match(editor, /cursor:text/);
});

test("Edit/Delete become Cancel/Save in the same spot, with the hint on the right", () => {
  assert.match(editor, />Cancel</);
  assert.match(editor, />Save</);
  assert.match(editor, /height:36px;padding:0 14px;border-radius:10px;border:0;background:var\(--accent\);color:var\(--accent-on\);font-family:inherit;font-size:13px;font-weight:650/);
  assert.match(editor, /flex:1;text-align:right;font-size:12px;color:var\(--text-faint\)/);
});

test("the rest dims, including the group header", () => {
  assert.match(detail, /opacity:\.4;pointer-events:none/);
  assert.match(detail, /const headDim = anyEditing \?/);
});

test("leaving with unsaved changes asks: Discard changes? / Keep editing / Discard", () => {
  assert.match(detail, /title: "Discard changes\?"/);
  assert.match(detail, /cancelLabel: "Keep editing"/);
  assert.match(detail, /confirmLabel: "Discard"/);
  assert.match(confirm, /quietDanger/);
  // The bottom nav asks through the same check; Back and the tab buttons are
  // inside the screen, so one capture-phase guard there covers them (and a
  // tap on a dimmed area).
  assert.match(panel, /if \(!\(await confirmLeaveEdit\(\)\)\) return;/);
  assert.match(detail, /app\.addEventListener\("click", async \(e\) => \{[\s\S]*?\}, true\);/);
  assert.match(detail, /e\.stopPropagation\(\);/);
});

test("the nav asks only when there is a draft, not on every tap", () => {
  assert.doesNotMatch(panel, /Discard your edit\?/);
  assert.match(detail, /if \(editDirty\(\)\) \{/);
});

test("Esc cancels; Cmd/Ctrl+Enter saves without inserting a newline", () => {
  const binder = detail.slice(detail.indexOf("function bindEditorEvents"), detail.indexOf("function bindEvents()"));
  assert.match(binder, /e\.key === "Enter" && \(e\.ctrlKey \|\| e\.metaKey\)\) \{\s*e\.preventDefault\(\)/);
  assert.match(binder, /e\.key === "Escape"/);
});

if (failures) { console.log(`\n${failures} failing`); process.exit(1); }
console.log("\nPASS edit in place");
