import { activeTab, setNav, showChrome } from "../nav.js";
import { FLAME, GOOGLE_G, app, bundle, esc, send, setFor, setHTML, summarize, toast, topOfView } from "../core.js";
import { computeStreak, dayKey, exportAll, importAll } from "../../storage/store.js";
import { getAuth, googleSignIn, login, register } from "../../sync/auth.js";
import { renderHome } from "../views/home.js";
import { syncNow } from "../../sync/sync.js";
import { renderSetDetail } from "../views/set-detail.js";
import { review } from "../../storage/srs.js";

export async function renderYou() {
  setNav("you");
  showChrome(true);
  const { studySets, activity, settings } = await bundle();
  let mastered = 0,
    total = 0;
  for (const s of studySets) {
    const x = summarize(s);
    mastered += x.mastered;
    total += x.total;
  }
  const streak = computeStreak(activity);
  const auth = await getAuth();

  let billingHtml = "";
  let globalPlan = "free";
  if (auth?.user) {
    try {
      const { authedFetch } = await import("../../sync/auth.js");
      const meRes = await authedFetch('/v1/me');
      const PLAN_COPY = `<div style="font-size:11px;color:var(--muted);text-align:center;margin-top:6px">Plus $2/month, Pro $6/month</div>`;
        if (meRes.ok) {
          const data = await meRes.json();
          const plan = data.usage.plan;
            globalPlan = plan;
          const usage = data.usage;
          if (plan === "free" || plan === "plus") {
            const winText = usage.window === "day" ? "today" : "this month";
            
            const meter = (name, u, l) => {
               if (l === null) return "";
               const pct = Math.min(100, Math.max(0, (u / l) * 100));
               return `
                 <div style="font-size:12px;color:var(--muted);display:flex;justify-content:space-between">
                   <span>${name}</span>
                   <span>${u} of ${l}</span>
                 </div>
                 <div class="bar" style="margin-bottom:8px"><i style="width:${pct}%"></i></div>
               `;
            };

            const metersHtml = meter("Set generations", usage.set.used, usage.set.limit) +
                               meter("Coding exercises", usage.coding.used, usage.coding.limit) +
                               meter("Practice gradings", usage.practice.used, usage.practice.limit);

            const title = plan === "plus" ? "Mafsar Plus" : "Mafsar Free";
            
            let btnsHtml = "";
            if (plan === "free") {
              btnsHtml = `
                <div style="display:flex;gap:8px">
                  <button class="btn btn-primary" style="flex:1;padding:7px 10px;font-size:12.5px;" data-action="billing-checkout" data-plan="plus" data-current-plan="${plan}">Upgrade to Plus</button>
                  <button class="btn btn-ghost" style="flex:1;padding:7px 10px;font-size:12.5px;" data-action="billing-checkout" data-plan="pro" data-current-plan="${plan}">Upgrade to Pro</button>
                </div>
                ${PLAN_COPY}
              `;
            } else if (plan === "plus") {
              btnsHtml = `
                <div style="display:flex;gap:8px">
                  <button class="btn btn-ghost" style="flex:1;padding:7px 10px;font-size:12.5px;" data-action="billing-portal">Manage subscription</button>
                  <button class="btn btn-primary" style="flex:1;padding:7px 10px;font-size:12.5px;" data-action="billing-checkout" data-plan="pro" data-current-plan="${plan}">Upgrade to Pro</button>
                </div>
                ${PLAN_COPY}
              `;
            }

            billingHtml = `
              <div class="block" style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px">
                <div style="font-weight:600;font-size:13px">${title}</div>
                <div style="font-size:12px;color:var(--muted);margin-bottom:4px">Usage ${winText}</div>
                ${metersHtml}
                <div style="margin-top:6px">
                  ${btnsHtml}
                </div>
              </div>
            `;
          } else {
            billingHtml = `
              <div class="block" style="display:flex;flex-direction:column;gap:10px;margin-bottom:12px">
                <div style="font-weight:600;font-size:13px;display:flex;align-items:center;gap:6px">
                  <svg class="ic" viewBox="0 0 24 24" style="color:var(--primary);width:16px;height:16px"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                  Mafsar Pro
                </div>
                <div style="font-size:12px;color:var(--muted)">Unlimited generations</div>
                <button class="btn btn-ghost btn-block" data-action="billing-portal">Manage subscription</button>
              </div>
            `;
          }
        }
      } catch (e) {
      // Session expiry is actionable; other errors (network, 500) shouldn't
      // block the rest of the You tab from rendering, but the user should know.
      if (e.message) toast(e.message);
    }
  }

  const accountHtml = auth?.user
    ? `${billingHtml}<div class="block" style="display:flex;flex-direction:column;gap:10px">
         <div style="display:flex;align-items:center;gap:10px">
           <span class="tag dot" style="color:var(--success)"></span>
           <div style="min-width:0">
             <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(auth.user.email)}</div>
             <div style="font-size:11.5px;color:var(--muted)">${
               auth.lastSync ? "Last synced " + new Date(auth.lastSync).toLocaleString() : "Not backed up yet"
             }</div>
           </div>
         </div>
         <button class="btn btn-ghost btn-block" data-action="auth-signout">Sign out</button>
       </div>`
    : `<div class="block" style="display:flex;flex-direction:column;gap:10px">
         <div style="font-weight:600;font-size:13px">Back up and sync</div>
         <div style="font-size:12px;color:var(--muted);line-height:1.5">Sign in to sync your sets across devices. Everything works offline without an account.</div>
         <button class="btn btn-ghost btn-block" data-action="auth-google">${GOOGLE_G} Continue with Google</button>
         <div class="or-divider">or</div>
         <div class="field"><label>Email</label><input id="youEmail" type="email" placeholder="you@example.com" autocomplete="email" /></div>
         <div class="field"><label>Password</label><input id="youPass" type="password" placeholder="8+ characters" autocomplete="new-password" /></div>
         <div style="display:flex;gap:10px">
           <button class="btn btn-primary" style="flex:1" data-action="auth-signin">Sign in</button>
           <button class="btn btn-ghost" style="flex:1" data-action="auth-register">Create account</button>
         </div>
       </div>`;

  setHTML(app, `
    <div class="view">
      <div class="ahd"><div class="wordmark">Maf<b>sar</b></div></div>
      <div class="block" style="text-align:center;padding:20px">
        <div style="font-size:13px;color:var(--muted)">${auth?.user ? "Your sets are backed up" : "Everything stays on this device"}</div>
        <div style="display:flex;justify-content:center;gap:8px;margin-top:12px">
          <span class="streak">${FLAME}${streak}-day streak</span>
        </div>
      </div>
      <div class="stats">
        <div class="stat"><div class="v tnum">${mastered}</div><div class="k">Mastered</div></div>
        <div class="stat"><div class="v tnum">${total}</div><div class="k">Cards</div></div>
        <div class="stat"><div class="v tnum">${studySets.length}</div><div class="k">Sets</div></div>
      </div>
      ${accountHtml}
            <div class="listhd"><span class="t-label">Backup</span></div>
      ${globalPlan === "plus" || globalPlan === "pro" ? `<div style="display:flex;gap:10px">
        <button class="btn btn-ghost" style="flex:1" data-action="export-backup">⇩ Export JSON</button>
        <button class="btn btn-ghost" style="flex:1" data-action="import-backup">⇪ Restore</button>
      </div>` : `<div style="font-size:12px;color:var(--muted);text-align:center;padding:10px 0">Available on Plus and Pro plans.</div>`}
      <input type="file" id="backupFile" accept="application/json,.json" class="hidden" />
    </div>`);
  topOfView();
}

// --- account actions ---------------------------------------------------------

export let googleAbortController = null;
export async function authGoogle(btn) {
  if (googleAbortController) {
    googleAbortController.abort();
    googleAbortController = null;
    renderHome();
    return;
  }
  btn.disabled = true;
  
  const originalNodes = Array.from(btn.childNodes);
  setHTML(btn, 'Waiting for Google... <button class="btn btn-ghost" style="margin-left:auto;padding:2px 8px;font-size:12px;min-height:0" data-action="auth-google-cancel">Cancel</button>');
  
  googleAbortController = new AbortController();
  try {
    const user = await googleSignIn({
      onTab: (url) => chrome.tabs.create({ url, active: true }, (tab) => {
        (/** @type {any} */ (googleAbortController)).tabId = tab.id;
      }),
      cancelSignal: googleAbortController.signal
    });
    if ((/** @type {any} */ (googleAbortController)).tabId) chrome.tabs.remove((/** @type {any} */ (googleAbortController)).tabId);
    googleAbortController = null;
    await afterSignIn(false);
  } catch (e) {
    if (/** @type {any} */ (googleAbortController)?.tabId) chrome.tabs.remove((/** @type {any} */ (googleAbortController)).tabId).catch(() => {});
    googleAbortController = null;
    if (e.message !== 'cancelled') {
      toast(e.message === 'google_unavailable' ? "Google sign-in isn't available right now." : e.message);
    }
    btn.disabled = false;
    btn.replaceChildren(...originalNodes);
  }
}

export async function afterSignIn(wasSignedIn) {
  if (!wasSignedIn) toast("Signed in");
  try {
    await syncNow();
  } catch (e) {
  }
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
      if (!confirm("Restore this backup? It replaces ALL local Mafsar data.")) return;
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
        <div style="font-size:13px;color:var(--muted);margin-top:6px;line-height:1.5">
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
