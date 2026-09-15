import { app, send, setHTML, toast, topOfView } from "../core.js";
import { showChrome } from "../nav.js";
import { authedFetch } from "../../sync/auth.js";
import { canConfirmDeletion } from "../../storage/account.js";
import { renderAuthGate } from "./you.js";

// Ask for the password until /v1/me says the account has none, so a slow or
// failed lookup can only make the form stricter, never looser.
let hasPassword = true;

export async function renderDeleteAccount() {
  hasPassword = true;
  showChrome(false);
  setHTML(app, `
    <div class="view">
      <div class="ahd">
        <button class="iconbtn" data-action="nav-back" aria-label="Back"><svg class="ic" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>
        <div class="h-title" style="font-size:16px">Delete account</div><span style="width:32px"></span>
      </div>
      <div class="block danger-block">
        <div style="font-weight:650">This can't be undone.</div>
        <ul class="danger-list">
          <li>Your sets, cards, quiz questions and review history are deleted from our servers.</li>
          <li>Teams you created are closed, and you leave teams you joined.</li>
          <li>An active Plus or Pro subscription is cancelled immediately, with no further charges.</li>
          <li>Mafsar's data in this browser is erased too.</li>
        </ul>
      </div>
      <div class="field" id="delPassField"><label for="delPass">Your password</label>
        <input id="delPass" type="password" autocomplete="current-password" /></div>
      <div class="field"><label for="delConfirm">Type DELETE to confirm</label>
        <input id="delConfirm" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" /></div>
      <button class="btn btn-primary btn-block btn-danger" data-action="delete-account-confirm" disabled>Delete my account</button>
    </div>`);
  topOfView();
  for (const id of ["delPass", "delConfirm"]) document.getElementById(id)?.addEventListener("input", refreshButton);

  try {
    const res = await authedFetch("/v1/me");
    if (res.ok) {
      hasPassword = !!(await res.json()).hasPassword;
      document.getElementById("delPassField")?.classList.toggle("hidden", !hasPassword);
      refreshButton();
    }
  } catch {
    /* keep the stricter form */
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
  btn.textContent = "Deleting…";
  try {
    await send({ type: "DELETE_ACCOUNT", password: hasPassword ? password : "" });
    toast("Your account was deleted.");
    renderAuthGate();
  } catch (e) {
    toast(e.message);
    btn.disabled = false;
    btn.textContent = "Delete my account";
  }
}

