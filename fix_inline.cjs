const fs = require("fs");
let detail = fs.readFileSync("src/ui/views/set-detail.js", "utf8");

// Remove editForm from the top
detail = detail.replace(/const editForm = editingCardId[\s\S]*?\} : "";/, '');
detail = detail.replace(/\$\{editForm\}/, '');

// Insert inline edit form
const cardMap = `studySet.flashcards
                .map((c) => {
                  if (c.id === editingCardId) {
                    return \`<div class="block editcard" style="margin: 8px 0;">
                       <div class="field"><label>Front</label><textarea id="editFront" rows="2">\${esc(c.front || "")}</textarea></div>
                       <div class="field"><label>Back</label><textarea id="editBack" rows="3">\${esc(c.back || "")}</textarea></div>
                       <div style="display:flex;gap:10px">
                         <button class="btn btn-ghost" style="flex:1" data-action="edit-cancel">Cancel</button>
                         <button class="btn btn-primary" id="editSaveBtn" style="flex:1" data-action="edit-save" data-id="\${esc(c.id)}">Save</button>
                       </div>
                     </div>\`;
                  }
                  const fromChain = isLinkCard(c);
                  const opacity = editingCardId ? "0.4" : "1";
                  return \`<div class="cardrow" style="opacity: \${opacity}" data-card-id="\${esc(c.id)}"><span class="sdot \${masteryOf(c)}"></span><span class="q">\${esc(c.front)}</span><span class="due">\${
                      isDue(c) ? "Due now" : timeUntil(c.dueDate)
                    }</span>
                     <span class="rowbtns">\${
                       fromChain
                         ? \`<span class="tag" title="Made from a mechanism chain. Edit it in the Chains tab.">chain</span>\`
                         : \`<button class="iconbtn ic-xs" data-action="card-edit" data-id="\${esc(c.id)}" aria-label="Edit"><svg class="ic" viewBox="0 0 24 24"><path d="M4 20l4-1L20 7l-3-3L5 16l-1 4z"/></svg></button>
                       <button class="iconbtn ic-xs" data-action="card-del" data-id="\${esc(c.id)}" aria-label="Delete"><svg class="ic" viewBox="0 0 24 24"><path d="M5 7h14M9 7V5h6v2m-8 0l1 13h8l1-13"/></svg></button>\`
                     }</span></div>\`;
                })
                .join("")`;

detail = detail.replace(/studySet\.flashcards\s*\.map\(\(c\) => \{[\s\S]*?\}\s*\)\s*\.join\(""\)/, cardMap);

fs.writeFileSync("src/ui/views/set-detail.js", detail);
