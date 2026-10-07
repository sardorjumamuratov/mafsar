import fs from "fs";
let code = fs.readFileSync("src/ui/flows/shell.js", "utf8");

const newFuncs = `
import { send, toast } from "../core.js";
import { openSheet, closeSheet } from "../sheet.js";
import { addCard } from "../../storage/store.js";
import { isDuplicate } from "../../storage/card-dedupe.js";

export async function openSuggestionSheet(sessionId, mode, gaps, topic, existingCards) {
  const existingFronts = existingCards.map(c => c.front).slice(0, 50);
  
  // Show a wait row in the sheet
  openSheet("Turn gaps into cards", \`
    <div style="display:flex;align-items:center;justify-content:center;height:100px;color:var(--text-secondary)">
      \${icon("loader", 20, 2, "st-spin")}
    </div>
  \`, false, null, { px: 16, pb: 24, gap: 14 });

  let res;
  try {
    res = await send({ type: "DRILL_CARD_SUGGESTIONS", mode, gaps, topic, existingFronts });
  } catch (e) {
    if (e.error === "feature_disabled") {
      closeSheet();
      toast("Suggestions are currently disabled.");
      return;
    }
    closeSheet();
    toast(e.message || "Could not generate suggestions.");
    return;
  }
  
  if (!res.suggestions || res.suggestions.length === 0) {
    openSheet("Turn gaps into cards", \`
      <div class="st-text15" style="text-align:center;color:var(--text-secondary);padding:24px 0">
        No new concepts needed.
      </div>
      <button type="button" class="sheet-quiet" id="sugg-close">Close</button>
    \`, false, null, { px: 16, pb: 24, gap: 14 });
    document.getElementById("sugg-close")?.addEventListener("click", () => closeSheet());
    return;
  }

  let skippedCount = 0;
  const validSuggestions = [];
  for (const sugg of res.suggestions) {
    if (isDuplicate(sugg.front, existingFronts, 0.7)) {
      skippedCount++;
    } else {
      validSuggestions.push(sugg);
    }
  }

  if (validSuggestions.length === 0) {
    openSheet("Turn gaps into cards", \`
      <div class="st-text15" style="text-align:center;color:var(--text-secondary);padding:24px 0">
        \${skippedCount} \${skippedCount === 1 ? "is" : "are"} already in your set. No new cards to add.
      </div>
      <button type="button" class="sheet-quiet" id="sugg-close">Close</button>
    \`, false, null, { px: 16, pb: 24, gap: 14 });
    document.getElementById("sugg-close")?.addEventListener("click", () => closeSheet());
    return;
  }

  const html = validSuggestions.map((s, i) => \`
    <label style="display:flex;gap:12px;padding:12px;background:var(--bg-surface);border:1px solid var(--border-control);border-radius:12px;cursor:pointer">
      <input type="checkbox" checked data-sugg-idx="\${i}" style="margin-top:2px">
      <div style="display:flex;flex-direction:column;gap:4px">
        <div style="font-weight:650;font-size:14px;color:var(--text-primary)">\${esc(s.front)}</div>
        <div style="font-size:14px;color:var(--text-secondary);line-height:1.4">\${esc(s.back)}</div>
        \${s.reason ? \`<div style="font-size:13px;color:var(--status-learning);margin-top:4px">\${esc(s.reason)}</div>\` : ""}
      </div>
    </label>
  \`).join("");

  openSheet("Turn gaps into cards", \`
    \${skippedCount > 0 ? \`<div class="st-note" style="margin-bottom:12px">\${skippedCount} \${skippedCount === 1 ? "is" : "are"} already in your set.</div>\` : ""}
    <div style="display:flex;flex-direction:column;gap:12px;max-height:400px;overflow-y:auto;margin:0 -16px;padding:0 16px">\${html}</div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:16px">
      <button type="button" class="sheet-primary" id="sugg-add">Add selected cards</button>
      <button type="button" class="sheet-quiet" id="sugg-cancel">Not now</button>
    </div>
  \`, false, null, { px: 16, pb: 24, gap: 0 });

  document.getElementById("sugg-cancel")?.addEventListener("click", () => closeSheet());
  
  const addBtn = document.getElementById("sugg-add");
  const checkboxes = Array.from(document.querySelectorAll('input[data-sugg-idx]'));
  
  checkboxes.forEach(cb => {
    cb.addEventListener("change", () => {
      addBtn.disabled = !checkboxes.some(c => c.checked);
    });
  });

  addBtn?.addEventListener("click", async () => {
    const selected = checkboxes.filter(c => c.checked).map(c => validSuggestions[parseInt(c.getAttribute("data-sugg-idx"), 10)]);
    addBtn.disabled = true;
    addBtn.textContent = "Adding...";
    try {
      for (const s of selected) {
        await addCard(sessionId, s.front, s.back);
      }
      toast(\`Added \${selected.length} card\${selected.length === 1 ? "" : "s"}.\`);
      closeSheet();
    } catch (e) {
      toast("Failed to add cards.");
      addBtn.disabled = false;
      addBtn.textContent = "Add selected cards";
    }
  });
}
`;

if (!code.includes("openSuggestionSheet")) {
  code = code.replace(
    'import { app, esc, setHTML } from "../core.js";',
    'import { app, esc, setHTML, send, toast } from "../core.js";'
  );
  
  // Actually I need to add import for openSheet and addCard etc.
  // I'll just append it to the file and add imports if not present.
  const imports = `
import { openSheet, closeSheet } from "../sheet.js";
import { addCard } from "../../storage/store.js";
import { isDuplicate } from "../../storage/card-dedupe.js";
`;
  code = code.replace(
    'import { app, esc, setHTML',
    imports.trim() + '\nimport { app, esc, setHTML, send, toast'
  );
  // wait, core.js might not export `send` or `toast`?
  // the drills import `send, toast` from `../core.js`.
  code += newFuncs;
  fs.writeFileSync("src/ui/flows/shell.js", code, "utf8");
  console.log("Added openSuggestionSheet");
} else {
  console.log("Already present");
}
