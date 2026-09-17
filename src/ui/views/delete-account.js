import { app, esc, send, setHTML, toast, topOfView } from "../core.js";
import { showChrome } from "../nav.js";
import { authedFetch, getAuth } from "../../sync/auth.js";
import { canConfirmDeletion } from "../../storage/account.js";
import { renderAuthGate } from "./you.js";

let hasPassword = true;

export async function renderDeleteAccount() {
  hasPassword = true;
  showChrome(false);
  const auth = await getAuth();
  
  setHTML(app, `
    <div class="view">
      <div class="ahd">
        <button class="iconbtn" data-action="nav-back" aria-label="Back"><svg class="ic" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>
        <div class="h-title" style="font-size:16px">Delete account</div><span style="width:32px"></span>
      </div>
      <div style="font-size:13.5px;line-height:1.5;margin-bottom:20px;">Deleting your account permanently removes it and everything in it. This can't be undone.</div>
      
      <div class="t-label">What gets deleted</div>
      <ul style="margin:8px 0 24px;padding-left:20px;font-size:13.5px;line-height:1.6;color:var(--muted)">
        <li>Your study sets, flashcards, quizzes and review history</li>
        <li>Teams you created. Members lose access, and you leave teams you joined.</li>
        <li id="delPlanItem" class="hidden"></li>
      </ul>

      <div class="block" style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:24px;background:var(--surface);border-radius:var(--r-md);padding:12px">
        <div style="font-size:13px;font-weight:500;">Want a copy first?</div>
        <button type="button" class="btn btn-ghost" data-action="export-backup" style="font-size:12px;padding:6px 10px;">Export your data</button>
      </div>

      <div style="font-size:13px;color:var(--muted);margin-bottom:12px;">Signed in as ${esc(auth?.user?.email || "...")}</div>

      <div id="delPassContainer">
        <div class="field" id="delPassField">
          <label for="delPass">Enter your password to continue</label>
          <input id="delPass" type="password" autocomplete="current-password" />
        </div>
      </div>

      <div class="field">
        <label for="delConfirm">To confirm, type DELETE</label>
        <input id="delConfirm" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" />
      </div>

      <div style="display:flex;gap:8px;margin-top:24px;">
        <button type="button" class="btn btn-ghost" style="flex:1" data-action="nav-back">Cancel</button>
        <button type="button" class="btn btn-primary btn-danger" style="flex:1" data-action="delete-account-confirm" disabled>Delete account</button>
      </div>
    </div>`);
  
  topOfView();
  for (const id of ["delPass", "delConfirm"]) document.getElementById(id)?.addEventListener("input", refreshButton);

  try {
    const res = await authedFetch("/v1/me");
    if (res.ok) {
      const data = await res.json();
      hasPassword = !!data.hasPassword;
      if (!hasPassword) {
        document.getElementById("delPassContainer").innerHTML = `<div style="font-size:13px;color:var(--muted);margin-bottom:16px;">You signed in with Google, so no password is needed.</div>`;
      }
      if (data.plan && data.plan !== "free") {
        const planItem = document.getElementById("delPlanItem");
        if (planItem) {
          planItem.textContent = `Your ${data.plan === "pro" ? "Pro" : "Plus"} subscription, cancelled right away with no further charges`;
          planItem.classList.remove("hidden");
        }
      }
      refreshButton();
    }
  } catch {
    // keep strict form
  }
}

function refreshButton() {
  const btn = /** @type {HTMLButtonElement|null} */ (app.querySelector('[data-action="delete-account-confirm"]'));
  if (!btn) return;
  btn.disabled = !canConfirmDeletion({
    typed: /** @type {HTMLInputElement|null} */ (document.getElementById("delConfirm"))?.value,
    password: /** @type {HTMLInputElement|null} */ (document.getElementById("delPass"))?.value,
    hasPassword,
  });
}

export async function confirmDeleteAccount() {
  const typed = /** @type {HTMLInputElement|null} */ (document.getElementById("delConfirm"))?.value;
  const password = /** @type {HTMLInputElement|null} */ (document.getElementById("delPass"))?.value;
  if (!canConfirmDeletion({ typed, password, hasPassword })) return;
  const btn = /** @type {HTMLButtonElement} */ (app.querySelector('[data-action="delete-account-confirm"]'));
  btn.disabled = true;
  btn.textContent = "Deleting account...";
  try {
    await send({ type: "DELETE_ACCOUNT", password: hasPassword ? password : "" });
    toast("Your account has been deleted.");
    renderAuthGate();
  } catch (e) {
    toast(e.message);
    btn.disabled = false;
    btn.textContent = "Delete account";
  }
}
