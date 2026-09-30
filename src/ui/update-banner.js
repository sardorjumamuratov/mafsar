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
    return `<div class="block tint" style="margin:16px 16px 0; display:flex; align-items:center; gap:10px" role="status"><span>${esc(state.clientOutdated)}</span></div>`;
  }
  if (!state.updateReady || dismissedFor() === state.updateReady) return "";
  return `<div class="block tint" style="margin:16px 16px 0; display:flex; align-items:center; justify-content:space-between; gap:10px" role="status">
      <span>Mafsar ${esc(state.updateReady)} is ready.</span>
      <div style="display:flex;gap:6px">
        <button type="button" class="btn-sm" style="color:var(--accent-text)" data-action="apply-update">Restart</button>
        <button type="button" class="iconbtn" style="width:36px;height:36px" data-action="dismiss-update" aria-label="Dismiss"><svg class="ic" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
      </div>
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
  el?.closest(".block.tint")?.remove();
}

function dismissedFor() {
  try {
    return sessionStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}
