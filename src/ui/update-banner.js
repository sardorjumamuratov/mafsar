// "A new version is ready" and "this version is too old" banners. The worker
// records both in storage (onUpdateAvailable, and a 426 from the API); Home and
// You render whichever applies.
import { esc } from "./core.js";

const DISMISS_KEY = "mafsar.updateDismissed";

/** Callback-style read, like the rest of the codebase (Firefox-safe). */
function readFlags() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(["updateReady", "clientOutdated"], (obj) => resolve(obj || {}));
    } catch {
      resolve({});
    }
  });
}

export async function updateBannerHtml() {
  const state = await readFlags();
  if (state.clientOutdated) {
    return `<div class="update-banner warn" role="status"><span>${esc(state.clientOutdated)}</span></div>`;
  }
  if (!state.updateReady || dismissedFor() === state.updateReady) return "";
  return `<div class="update-banner" role="status">
      <span>Mafsar ${esc(state.updateReady)} is ready.</span>
      <button type="button" class="btn btn-primary btn-sm" data-action="apply-update">Restart</button>
      <button type="button" class="iconbtn ic-xs" data-action="dismiss-update" aria-label="Dismiss"><svg class="ic ic-sm" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
    </div>`;
}

/** Hide the "ready" banner for the rest of this panel session. */
export async function dismissUpdateBanner(el) {
  const { updateReady } = await readFlags();
  try {
    sessionStorage.setItem(DISMISS_KEY, String(updateReady || ""));
  } catch {
    /* storage unavailable: dismiss visually only */
  }
  el?.closest(".update-banner")?.remove();
}

function dismissedFor() {
  try {
    return sessionStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}
