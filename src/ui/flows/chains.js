import { app, bundle, esc, setFor, setHTML, toast, topOfView } from "../core.js";
import { showChrome } from "../nav.js";
import { saveStudySet, uid } from "../../storage/store.js";
import { editStep, stepLabel } from "../../storage/chains.js";
import { renderSetDetail } from "../views/set-detail.js";

// Editing one step of a mechanism chain (Medicine mode). Edits are marked so
// regeneration never overwrites them (mergeChains in storage/chains.js).

let editing = null; // { sessionId, chainId, key }

export async function openChainStepEdit(sessionId, chainId, key) {
  const { studySets } = await bundle();
  const set = setFor(sessionId, studySets);
  const chain = (set?.chains || []).find((c) => c.id === chainId && !c.deleted);
  if (!chain) return toast("That chain no longer exists.");
  const step = (chain.steps || []).find((s) => s.key === key && !s.deleted);
  editing = { sessionId, chainId, key };
  const label = stepLabel(chain.template, key);
  showChrome(false);
  setHTML(app, `
    <div class="view">
      <div class="ahd">
        <button class="iconbtn" data-action="chain-edit-cancel" aria-label="Back"><svg class="ic" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>
        <div class="h-title" style="font-size:16px">${step ? "Edit" : "Add"} ${esc(label)}</div><span style="width:32px"></span>
      </div>
      <div class="help">${esc(chain.title)} · your edits are kept when the set is regenerated.</div>
      <div class="field"><label for="chainStmt">What happens at this step</label>
        <textarea id="chainStmt" class="sa-input" rows="3">${esc(step?.statement || "")}</textarea></div>
      <div class="field"><label for="chainWhy">Why it follows from the step before (optional)</label>
        <textarea id="chainWhy" class="sa-input" rows="3">${esc(step?.why || "")}</textarea></div>
      <div class="del-actions">
        <button class="btn btn-ghost" data-action="chain-edit-cancel">Cancel</button>
        <button class="btn btn-primary" data-action="chain-edit-save">Save</button>
      </div>
      ${step ? `<button class="linkbtn chain-remove" data-action="chain-edit-remove">Remove this step</button>` : ""}
    </div>`);
  topOfView();
  document.getElementById("chainStmt")?.focus();
}

async function commit(values) {
  if (!editing) return;
  const { sessionId, chainId, key } = editing;
  const { studySets } = await bundle();
  const set = setFor(sessionId, studySets);
  const chain = (set?.chains || []).find((c) => c.id === chainId);
  if (!set || !chain) return toast("That chain no longer exists.");
  const updated = editStep(chain, key, values, { uid });
  await saveStudySet({ ...set, chains: set.chains.map((c) => (c.id === chainId ? updated : c)) });
  editing = null;
  renderSetDetail(sessionId, "chains");
}

export async function saveChainStep() {
  const statement = /** @type {HTMLTextAreaElement|null} */ (document.getElementById("chainStmt"))?.value || "";
  const why = /** @type {HTMLTextAreaElement|null} */ (document.getElementById("chainWhy"))?.value || "";
  if (!statement.trim()) return toast("Write what happens at this step, or remove it.");
  return commit({ statement, why });
}

export function removeChainStep() {
  return commit({ statement: "", why: "" });
}

export function cancelChainEdit() {
  const sessionId = editing?.sessionId;
  editing = null;
  if (sessionId) renderSetDetail(sessionId, "chains");
}

/** "Not now" on the "This looks like medicine" suggestion: never ask again for this set. */
export async function dismissMedicineSuggestion(sessionId) {
  const { studySets } = await bundle();
  const set = setFor(sessionId, studySets);
  if (!set) return;
  await saveStudySet({ ...set, dismissedMedicine: true });
  renderSetDetail(sessionId);
}
