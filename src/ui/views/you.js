import { activeTab, setNav, showChrome } from "../nav.js";
import { GOOGLE_G, app, bundle, esc, send, setFor, setHTML, toast, topOfView } from "../core.js";
import { dayKey, exportAll, importAll } from "../../storage/store.js";
import { getAuth, googleSignIn, login, register } from "../../sync/auth.js";
import { renderHome } from "../views/home.js";
import { syncNow } from "../../sync/sync.js";
import { renderSetDetail } from "../views/set-detail.js";
import { confirmSheet } from "../confirm.js";
import { updateBannerHtml } from "../update-banner.js";
import { SectionLabel } from "../components.js";
import { openSheet, closeSheet } from "../sheet.js";

// ===== YOU TAB ================================================================
// One 16px edge (the scroll container's padding), a profile card, then groups:
// a SectionLabel over one card of rows. No figures: Stats owns those.

const ico = (inner, color = "var(--accent-text)") => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const ICON = {
  bolt: '<path d="M13 2L4.5 13.5H12L11 22l8.5-11.5H12z"/>',
  team: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20v-1a4.5 4.5 0 014.5-4.5h4a4.5 4.5 0 014.5 4.5v1M16 4.6a3.5 3.5 0 010 6.8M21.5 20v-1a4.5 4.5 0 00-3-4.25"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/>',
  download: '<path d="M4 15v4a1 1 0 001 1h14a1 1 0 001-1v-4M12 4v11M7 10l5 5 5-5"/>',
  upload: '<path d="M4 15v4a1 1 0 001 1h14a1 1 0 001-1v-4M12 15V4M7 9l5-5 5 5"/>',
  logout: '<path d="M9 20H6a2 2 0 01-2-2V6a2 2 0 012-2h3M16 16l4-4-4-4M20 12H9"/>',
  login: '<path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 16l4-4-4-4M14 12H4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
};
const CHEVRON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>`;

/**
 * A settings row: icon tile, title and optional subtitle, and a trailing
 * item (a chevron unless given). `attrs` is markup the caller escapes.
 */
function row({ icon, title, sub = "", trailing = CHEVRON, attrs = "", iconColor = "var(--accent-text)", titleColor = "" }) {
  return `<button type="button" class="you-row" ${attrs}>
      <span class="you-tile">${ico(icon, iconColor)}</span>
      <span class="you-txt"><span class="you-title"${titleColor ? ` style="color:${titleColor}"` : ""}>${esc(title)}</span>${sub ? `<span class="you-sub">${esc(sub)}</span>` : ""}</span>
      ${trailing}
    </button>`;
}

function group(label, rows) {
  return `<section style="display:flex;flex-direction:column;gap:8px">${SectionLabel(label)}<div class="you-group">${rows}</div></section>`;
}

const trailText = (label) => `<span class="you-trail" style="font-size:14px;font-weight:600;color:var(--accent-text)">${esc(label)}</span>`;

/** "Not backed up yet" / "Backed up 5 min ago": the profile card's status line. */
export function backupStatus(lastSync, now = Date.now()) {
  const t = lastSync ? new Date(lastSync).getTime() : NaN;
  if (!Number.isFinite(t)) return "Not backed up yet";
  const s = Math.max(0, (now - t) / 1000);
  if (s < 60) return "Backed up just now";
  if (s < 3600) return `Backed up ${Math.floor(s / 60)} min ago`;
  const day = (x) => new Date(x).setHours(0, 0, 0, 0);
  const days = Math.round((day(now) - day(t)) / 86_400_000);
  if (days === 0) return `Backed up ${Math.floor(s / 3600)} h ago`;
  if (days === 1) return "Backed up yesterday";
  const d = new Date(t);
  const opts = /** @type {Intl.DateTimeFormatOptions} */ ({ month: "short", day: "numeric", ...(d.getFullYear() !== new Date(now).getFullYear() ? { year: "numeric" } : {}) });
  return `Backed up ${d.toLocaleDateString("en-US", opts)}`;
}

/** The avatar's letter: never an empty circle. */
export function avatarLetter(email) {
  const c = String(email || "").trim().charAt(0);
  return c ? c.toUpperCase() : "?";
}

export async function renderYou() {
  setNav("you");
  showChrome(true);
  const { settings } = await bundle();
  const auth = await getAuth();
  const signedIn = !!auth?.user;
  const openInTab = !!settings.openInTab;

  const profile = signedIn
    ? `<div style="padding:14px;border-radius:14px;background:var(--bg-surface);border:1px solid var(--border-card);display:flex;align-items:center;gap:12px">
        <span class="you-avatar" aria-hidden="true">${esc(avatarLetter(auth.user.email))}</span>
        <span style="display:flex;flex-direction:column;gap:2px;min-width:0">
          <span style="font-size:15px;font-weight:600;overflow-wrap:anywhere">${esc(auth.user.email)}</span>
          <span style="font-size:13px;color:var(--text-muted)">${esc(backupStatus(auth.lastSync))}</span>
        </span>
      </div>`
    : `<div class="you-group">${row({ icon: ICON.login, title: "Sign in", sub: "Back up and sync across devices", attrs: 'data-action="you-signin"' })}</div>`;

  const updateBanner = await updateBannerHtml();
  setHTML(app, `
    <div class="screen" data-view="you" style="padding:18px 16px 24px;gap:14px">
      ${updateBanner}
      <div style="padding:0 4px"><h1 style="margin:0;font-size:24px;font-weight:650;letter-spacing:-.02em">You</h1></div>
      ${profile}
      ${signedIn ? group("Plan", `<div id="billingSlot">${billingSkeleton()}</div>`) : ""}
      ${group("Study", row({ icon: ICON.team, title: "Teams", sub: "Study with a group", attrs: 'data-action="nav-teams"' }))}
      ${group("Preferences", row({
        icon: ICON.external, title: "Open in a tab", sub: "Full page instead of the side panel",
        attrs: `id="openInTabCheck" data-action="open-in-tab" role="switch" aria-checked="${openInTab}"`,
        trailing: '<span class="you-switch" aria-hidden="true"></span>',
      }))}
      ${group("Data", `<div id="backupSlot">${backupRows(null)}</div>`)}
      ${signedIn ? group("Account",
        row({ icon: ICON.logout, title: "Sign out", attrs: 'data-action="auth-signout"', trailing: "" })
        // The one red thing on the screen.
        + row({ icon: ICON.trash, title: "Delete account", sub: "Permanently delete your account and data", attrs: 'data-action="delete-account-open"',
          iconColor: "var(--danger-text)", titleColor: "var(--danger-text)" })) : ""}
      <input type="file" id="backupFile" accept="application/json,.json" class="hidden" />
    </div>`);
  topOfView();
  if (signedIn) refreshBilling().catch(() => {});
  else paintBackupSlot("free");
}

let billingToken = 0;

/** The Plan row while /v1/me is in flight: the row's own shape, so nothing jumps. */
function billingSkeleton() {
  return `
    <div class="skel" role="status" aria-label="Loading your plan">
      <div class="you-row" aria-hidden="true" style="cursor:default">
        <div class="sk" style="width:36px;height:36px;border-radius:10px;flex-shrink:0"></div>
        <div style="flex:1;display:flex;flex-direction:column;gap:6px">
          <div class="sk" style="height:14px;width:110px"></div>
          <div class="sk" style="height:12px;width:160px"></div>
        </div>
      </div>
    </div>`;
}

/**
 * Export and Restore. Backup is a Plus/Pro feature; `plan` null means the
 * plan isn't known yet, and the rows wait, disabled.
 */
function backupRows(plan) {
  const paid = plan === "plus" || plan === "pro";
  const off = paid ? "" : " disabled";
  return row({ icon: ICON.download, title: "Export JSON", sub: plan && !paid ? "Available on Plus and Pro" : "All sets and cards", attrs: `data-action="export-backup"${off}` })
    + row({ icon: ICON.upload, title: "Restore from file", sub: plan && !paid ? "Available on Plus and Pro" : "Replaces current data", attrs: `data-action="import-backup"${off}` });
}

/** Backup is a paid feature; the slot renders once the plan is known. */
function paintBackupSlot(plan) {
  const slot = document.getElementById("backupSlot");
  if (!slot) return;
  setHTML(slot, backupRows(plan));
}

/**
 * Fetch /v1/me and fill the Plan and Data slots. Runs after the paint:
 * awaiting it inline used to hold the entire You tab behind a network round
 * trip — two of them, when the access token needed refreshing.
 */
export async function refreshBilling() {
  const token = ++billingToken;
  let planHtml = "";
  let globalPlan = "free";
  try {
    const { authedFetch } = await import("../../sync/auth.js");
    const meRes = await authedFetch("/v1/me");
    if (meRes.ok) {
      const data = await meRes.json();
      const plan = data.usage.plan;
      globalPlan = plan;
      if (plan === "pro") {
        planHtml = row({ icon: ICON.bolt, title: "Mafsar Pro", sub: "Unlimited generations", attrs: 'data-action="billing-portal"', trailing: trailText("Manage") });
      } else {
        // Free and Plus: the same row, with how much of the window is left.
        const u = data.usage.set;
        const win = data.usage.window === "day" ? "today" : "this month";
        const sub = u?.limit != null ? `${u.used} of ${u.limit} set generations ${win}` : "Set generations";
        planHtml = plan === "plus"
          ? row({ icon: ICON.bolt, title: "Mafsar Plus", sub, attrs: 'data-action="billing-portal"', trailing: trailText("Manage") })
          : row({ icon: ICON.bolt, title: "Mafsar Free", sub, attrs: 'data-action="you-upgrade"', trailing: trailText("Upgrade") });
      }
    }
  } catch (e) {
    // Session expiry is actionable; other errors (network, 500) shouldn't
    // block the rest of the You tab from rendering, but the user should know.
    if (e.message) toast(e.message);
  }
  if (token !== billingToken) return; // user navigated away mid-flight
  const slot = document.getElementById("billingSlot");
  if (!slot) return;
  setHTML(slot, planHtml || row({ icon: ICON.bolt, title: "Plan", sub: "Couldn't load your plan", attrs: 'data-action="you-retry-plan"', trailing: trailText("Retry") }));
  paintBackupSlot(globalPlan);
}

/** Free → the two paid plans, as a sheet of rows. */
export function openUpgradeSheet() {
  openSheet("Upgrade", `<div class="you-group">
      ${row({ icon: ICON.bolt, title: "Mafsar Plus", sub: "$2/month · more generations and backup", attrs: 'data-action="billing-checkout" data-plan="plus" data-current-plan="free"', trailing: trailText("Choose") })}
      ${row({ icon: ICON.bolt, title: "Mafsar Pro", sub: "$6/month · unlimited generations", attrs: 'data-action="billing-checkout" data-plan="pro" data-current-plan="free"', trailing: trailText("Choose") })}
    </div>`, false, null, { px: 16, pb: 24, gap: 14 });
}

/**
 * The plan rows' actions. Only the trailing label changes while they run, so
 * a row keeps its icon and text (the old handlers rewrote the whole button).
 */
function busyLabel(el, text) {
  const target = el.querySelector(".you-trail") || el;
  const prev = target.textContent;
  target.textContent = text;
  el.disabled = true;
  return () => { target.textContent = prev; el.disabled = false; };
}

export async function openBillingPortal(el) {
  const restore = busyLabel(el, "Opening…");
  try {
    const res = await send({ type: "BILLING_PORTAL" });
    chrome.tabs.create({ url: res.url });
  } catch (e) {
    toast(e.message);
  } finally {
    restore();
  }
}

export async function startCheckout(el) {
  const plan = el.dataset.plan || "plus";
  const currentPlan = el.dataset.currentPlan || "free";
  const restore = busyLabel(el, "Opening…");
  try {
    const res = await send({ type: "BILLING_CHECKOUT", plan });
    closeSheet();
    const { pollBilling } = await import("../../sync/auth.js");
    let checkoutTabId = null;
    chrome.tabs.create({ url: res.url }, (tab) => { if (tab) checkoutTabId = tab.id; });
    await pollBilling({ cancelSignal: new AbortController().signal, fromPlan: currentPlan });
    if (checkoutTabId) await chrome.tabs.remove(checkoutTabId).catch(() => {});
    await renderYou();
  } catch (e) {
    toast(e.message);
  } finally {
    if (el.isConnected) restore();
  }
}

/** The Open in a tab switch: the whole row toggles it. */
export async function toggleOpenInTab(el, saveSettings) {
  const openInTab = el.getAttribute("aria-checked") !== "true";
  el.setAttribute("aria-checked", String(openInTab));
  try {
    await saveSettings({ openInTab });
    send({ type: "SET_OPEN_IN_TAB", value: openInTab }).catch(() => {});
  } catch (e) {
    el.setAttribute("aria-checked", String(!openInTab));
    toast(e.message);
  }
}

// --- account actions ---------------------------------------------------------

export let googleAbortController = null;
export async function authGoogle(btn) {
  if (googleAbortController) {
    googleAbortController.abort();
    // A stale attempt is ended and a new one started
  }
  btn.disabled = true;
  
  const originalNodes = Array.from(btn.childNodes);
  setHTML(btn, 'Waiting for Google... <button class="btn btn-ghost" style="margin-left:auto;padding:2px 8px;font-size:12px;min-height:0" data-action="auth-google-cancel">Cancel</button>');
  
  googleAbortController = new AbortController();
  
  const tabListener = (closedTabId) => { 
    if (closedTabId === googleAbortController?.tabId) { 
      googleAbortController.abort(); 
    } 
  };
  chrome.tabs.onRemoved.addListener(tabListener);
  
  try {
    const user = await googleSignIn({
      onTab: (url) => chrome.tabs.create({ url, active: true }, (tab) => {
        (/** @type {any} */ (googleAbortController)).tabId = tab.id;
      }),
      cancelSignal: googleAbortController.signal
    });
    
    if ((/** @type {any} */ (googleAbortController)).tabId) {
      chrome.tabs.remove((/** @type {any} */ (googleAbortController)).tabId).catch(() => {});
    }
    googleAbortController = null;
    chrome.tabs.onRemoved.removeListener(tabListener);
    
    await afterSignIn(false);
  } catch (e) {
    if (/** @type {any} */ (googleAbortController)?.tabId) {
      chrome.tabs.remove((/** @type {any} */ (googleAbortController)).tabId).catch(() => {});
    }
    googleAbortController = null;
    chrome.tabs.onRemoved.removeListener(tabListener);
    
    if (e.message !== 'cancelled') {
      toast(e.message === 'google_unavailable' ? "Google sign-in isn't available right now." : e.message);
    }
    btn.disabled = false;
    btn.replaceChildren(...originalNodes);
  }
}

export async function afterSignIn(wasSignedIn) {
  finishSignIn(wasSignedIn);
}

/**
 * Being signed in doesn't wait on the network. The first sync after a sign-in
 * can be slow or fail; that's a sync problem to report, not a sign-in that
 * never finishes.
 */
function finishSignIn(wasSignedIn) {
  if (!wasSignedIn) toast("Signed in");
  syncNow().catch(() => toast("Signed in, but couldn't sync yet."));
  if (!wasSignedIn && activeTab !== "you") renderHome();
  else renderYou();
}

export async function authSubmit(kind, btn) {
    const email = /** @type {HTMLInputElement} */ (document.getElementById("youEmail"))?.value.trim();
    const password = /** @type {HTMLInputElement} */ (document.getElementById("youPass"))?.value;
    if (!email || !password) return toast("Enter an email and password.");
    if (password.length < 8) return toast("Password needs at least 8 characters.");
    const wasSignedIn = !!(await getAuth())?.user;
    if (btn) btn.disabled = true;
    try {
      if (kind === "register") {
        await register(email, password);
      } else {
        await login(email, password);
      }
      await afterSignIn(wasSignedIn);
    } catch (e) {
      if (btn) btn.disabled = false;
      toast(e.message);
    }
}
export function downloadFile(filename, text, type = "text/plain") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** Anki-friendly TSV: tabs separate front/back; newlines separate cards. */
export async function exportSetTsv(sessionId) {
  const { studySets } = await bundle();
  const set = setFor(sessionId, studySets);
  if (!set?.flashcards?.length) return toast("This set has no cards yet.");
  const tsv = set.flashcards
    .map((c) => `${c.front.replace(/\t/g, " ").replace(/\r?\n/g, " ")}\t${(c.back || "").replace(/\t/g, " ").replace(/\r?\n/g, " ")}`)
    .join("\n");
  downloadFile(`${(set.title || "mafsar-set").replace(/[^\w\- ]+/g, "")}.txt`, tsv, "text/tab-separated-values");
  toast(`Exported ${set.flashcards.length} cards`);
}

export async function generateSummary(sessionId) {
  toast("Summarizing…");
  try {
    await send({ type: "SUMMARIZE", sessionId });
    renderSetDetail(sessionId, "summary");
  } catch (e) {
    toast(e.message);
  }
}

export async function exportBackup() {
  const data = await exportAll();
  downloadFile(`mafsar-backup-${dayKey()}.json`, JSON.stringify(data, null, 2), "application/json");
  toast("Backup downloaded");
}

export function importBackupFile(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const ok = await confirmSheet({
        title: "Restore this backup?",
        body: "Everything Mafsar has stored in this browser is replaced with the backup.",
        confirmLabel: "Restore backup",
        destructive: true,
      });
      if (!ok) return;
      await importAll(JSON.parse(String(reader.result)));
      toast("Backup restored");
      renderHome();
    } catch (e) {
      toast(e.message || "Invalid backup file.");
    }
  };
  reader.readAsText(file);
}

// date inputs + file input don't fire click-based data-action routing
export function renderAuthGate() {
  showChrome(false);
  setHTML(app, `
    <div class="view" style="justify-content:center;min-height:100%">
      <div style="text-align:center;margin-bottom:8px">
        <div class="wordmark" style="font-size:26px">Maf<b>sar</b></div>
        <div style="font-size:13px;color:var(--text-muted);margin-top:6px;line-height:1.5">
          Turn your AI chats into flashcards,<br>quizzes, and spaced-repetition review.
        </div>
      </div>
      <div class="block" style="display:flex;flex-direction:column;gap:10px">
        <button class="btn btn-ghost btn-block" data-action="auth-google">${GOOGLE_G} Continue with Google</button>
        <div class="or-divider">or</div>
        <div class="field"><label>Email</label><input id="youEmail" type="email" placeholder="you@example.com" autocomplete="email" /></div>
        <div class="field"><label>Password</label><input id="youPass" type="password" placeholder="8+ characters" autocomplete="new-password" /></div>
        <button class="btn btn-primary btn-block" data-action="auth-register">Create account</button>
        <button class="btn btn-ghost btn-block" data-action="auth-signin">Sign in</button>
      </div>
      <div class="help" style="text-align:center">Your sets sync across devices through your account.</div>
    </div>`);
  topOfView();
}

// init — account required: gate first launch until signed in, then sync.
