import { app, esc, send, setHTML, toast, topOfView } from "../core.js";
import { showChrome } from "../nav.js";
import { authedFetch, getAuth } from "../../sync/auth.js";
import { canConfirmDeletion } from "../../storage/account.js";
import { renderAuthGate } from "./you.js";

// Ask for the password until /v1/me says the account has none, so a slow or
// failed lookup can only make the form stricter, never looser.
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
      <p class="del-lead">Deleting your account permanently removes it and everything in it. This can't be undone.</p>

      <div class="t-label">What gets deleted</div>
      <ul class="del-list">
        <li>Your study sets, flashcards, quizzes and review history</li>
        <li>Teams you created. Members lose access, and you leave teams you joined.</li>
        <li id="delPlanItem" class="hidden"></li>
      </ul>

      <div class="block tint del-export">
        <span>Want a copy first?</span>
        <button type="button" class="btn btn-ghost btn-sm" data-action="export-backup">Export your data</button>
      </div>

      ${auth?.user?.email ? `<div class="del-who">Signed in as ${esc(auth.user.email)}</div>` : ""}

      <div class="field" id="delPassField">
        <label for="delPass">Enter your password to continue</label>
        <input id="delPass" type="password" autocomplete="current-password" />
      </div>
      <div class="del-who hidden" id="delGoogleNote">You signed in with Google, so no password is needed.</div>

      <div class="field">
        <label for="delConfirm">To confirm, type DELETE</label>
        <input id="delConfirm" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" />
      </div>

      <div class="del-actions">
        <button type="button" class="btn btn-ghost" data-action="nav-back">Cancel</button>
        <button type="button" class="btn btn-primary btn-danger" data-action="delete-account-confirm" disabled>Delete account</button>
      </div>
    </div>`);
  topOfView();
  for (const id of ["delPass", "delConfirm"]) document.getElementById(id)?.addEventListener("input", refreshButton);

  try {
    const res = await authedFetch("/v1/me");
    if (!res.ok) return;
    const data = await res.json();
    hasPassword = !!data.hasPassword;
    document.getElementById("delPassField")?.classList.toggle("hidden", !hasPassword);
    document.getElementById("delGoogleNote")?.classList.toggle("hidden", hasPassword);
    // The plan lives under usage; an admin's effective plan is reported there too,
    // but only a real subscription gets cancelled, so key on plus/pro.
    const plan = data.usage?.plan;
    const planItem = document.getElementById("delPlanItem");
    if (planItem && (plan === "plus" || plan === "pro")) {
      planItem.textContent = `Your ${plan === "pro" ? "Pro" : "Plus"} subscription, cancelled right away with no further charges`;
      planItem.classList.remove("hidden");
    }
    refreshButton();
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
  btn.textContent = "Deleting account…";
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
