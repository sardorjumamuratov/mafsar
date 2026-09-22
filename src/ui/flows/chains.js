import { app, bundle, esc, setHTML, XBTN, toast } from "../core.js";
import { setFocusReturn } from "./review.js";
import { saveStudySet } from "../../storage/store.js";

let editingState = null;

export async function openChainStepEdit(sessionId, chainId, key) {
  const { studySets } = await bundle();
  const set = studySets.find((s) => s.sessionId === sessionId);
  if (!set) return;
  const chain = (set.chains || []).find((c) => c.id === chainId);
  if (!chain) return;
  
  const step = (chain.steps || []).find((s) => s.key === key && !s.deleted) || { key, statement: "", why: "" };
  
  editingState = { sessionId, chainId, key, step, set, chain };
  setFocusReturn("set:" + sessionId);
  
  const LABELS = { cause: "Cause", mechanism: "Mechanism", physiological: "Physiological change", symptoms: "Symptoms", signs: "Signs", tests: "Tests", diagnosis: "Diagnosis", treatment: "Treatment" };
  
  setHTML(app, `
    <div class="rev-top">${XBTN}</div>
    <div class="rev-body teach" style="padding-bottom:120px">
      <div class="t-label">Edit ${esc(LABELS[key])}</div>
      <div class="help" style="margin-bottom:16px">Your edits survive regeneration.</div>
      
      <div class="field" style="margin-bottom:16px">
        <label>Statement (What happens)</label>
        <textarea id="chainStmt" rows="3" class="sa-input" style="font-size:15px;padding:12px">${esc(step.statement)}</textarea>
      </div>
      
      <div class="field">
        <label>Why (Link from the previous step)</label>
        <textarea id="chainWhy" rows="3" class="sa-input" style="font-size:15px;padding:12px" placeholder="Optional">${esc(step.why)}</textarea>
      </div>
      
      <div style="position:fixed;bottom:0;left:0;right:0;padding:16px;background:var(--bg);border-top:1px solid var(--border)">
        <button class="btn btn-primary btn-block" data-action="save-chain-step">Save</button>
      </div>
    </div>
  `);
}

export async function saveChainStep() {
  if (!editingState) return;
  const { set, chain, key, step } = editingState;
  
  const stmtBox = document.getElementById("chainStmt");
  const whyBox = document.getElementById("chainWhy");
  const statement = ((/** @type {HTMLTextAreaElement|null} */ (stmtBox))?.value || "").trim();
  const why = ((/** @type {HTMLTextAreaElement|null} */ (whyBox))?.value || "").trim();
  
  if (!statement) {
    return toast("Statement cannot be empty. Delete it instead?");
  }
  
  chain.steps = chain.steps || [];
  let existing = chain.steps.find((s) => s.key === key && !s.deleted);
  if (existing) {
    existing.statement = statement;
    existing.why = why;
    existing.editedAt = Date.now();
    existing.updatedAt = new Date().toISOString();
  } else {
    chain.steps.push({
      id: Math.random().toString(36).slice(2),
      key,
      statement,
      why,
      editedAt: Date.now(),
      updatedAt: new Date().toISOString(),
    });
  }
  chain.updatedAt = new Date().toISOString();
  set.updatedAt = new Date().toISOString();
  
  await saveStudySet(set);
  
  // Return to the set view
  const xbtn = document.querySelector(".rev-top .xbtn");
  if (xbtn) (/** @type {HTMLElement} */ (xbtn)).click();
}
