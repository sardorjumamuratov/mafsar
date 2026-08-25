import { COPY_SVG, bundle, esc, send, setFor, setHTML, toast } from "./core.js";
import { detail, paintDetail } from "./views/set-detail.js";
import { shareLinkFor } from "./share-link.js";
import { LANDING_BASE } from "../config.js";
import { saveStudySet } from "../storage/store.js";
import { setShareOpenFor, shareOpenFor } from "./views/home.js";

/**
 * Read-only value + copy icon button, shared by the per-set share link and the
 * team link/code fields. Tapping the field selects+copies too (select-all).
 */
export function copyRowHtml(label, value, hint = "", valueCls = "") {
  return `<div class="field">
    <label>${label}${hint ? ` <span style="font-weight:normal;color:var(--muted)">— ${hint}</span>` : ""}</label>
    <div style="display:flex;gap:8px">
      <input type="text" readonly value="${esc(value)}" class="share-readonly ${valueCls}" data-action="select-all" style="flex:1" />
      <button class="btn btn-ghost btn-sm copy-btn" data-action="share-copy" data-code="${esc(value)}" aria-label="Copy ${esc(label.toLowerCase())}">
        ${COPY_SVG}<span class="lbl">Copy</span>
      </button>
    </div>
  </div>`;
}

/** Set-detail share reveal: link + code + revoke, once a code exists. */
export function shareBlockHtml(studySet) {
  const code = studySet?.shareCode;
  if (!code) return "";
  return `<div class="block" style="display:flex;flex-direction:column;gap:12px">
    ${copyRowHtml("Link", shareLinkFor(code, LANDING_BASE), "anyone with it can add a copy")}
    ${copyRowHtml("Code", code, "entered under Sets → Add a shared set", "share-code tnum")}
    <div>
      <button class="linkbtn" style="align-self:flex-start" data-action="share-revoke" data-id="${esc(studySet.sessionId)}">Stop sharing</button>
      <div style="font-size:12px;color:var(--muted);margin-top:2px">Both link and code will stop working. Copies already added are kept.</div>
    </div>
  </div>`;
}

/** Make sure the set has a share code, creating (and caching) one if needed. */
export async function ensureShareFor(sessionId) {
  const { studySets } = await bundle();
  const set = setFor(sessionId, studySets);
  if (!set) return null;
  if (set.shareCode) return set;
  toast("Creating link…");
  try {
    const r = await send({ type: "SHARE_CREATE", setId: sessionId });
    set.shareCode = r.code;
    await saveStudySet(set);
    return set;
  } catch (e) {
    toast(e.message || "Couldn't create a share link.");
    return null;
  }
}

/** Header "Share link" button: reveal (creating the code if needed) or hide. */
export async function toggleSetShare(sessionId) {
  if (shareOpenFor === sessionId) {
    setShareOpenFor(null);
    return paintDetail();
  }
  const set = await ensureShareFor(sessionId);
  if (!set) return;
  setShareOpenFor(sessionId);
  paintDetail();
}

export async function copyShareCode(code, btn = null) {
  try {
    await navigator.clipboard.writeText(code);
    toast("Copied to clipboard");
    if (btn) {
      const children = [...btn.childNodes];
      setHTML(btn, `<span class="lbl">✓ Copied</span>`);
      btn.setAttribute("aria-live", "polite");
      setTimeout(() => {
        btn.replaceChildren(...children);
        btn.removeAttribute("aria-live");
      }, 1500);
    }
  } catch {
    toast("Copy failed — the text stays selected in the field");
  }
}

export async function revokeShareFor(sessionId) {
  const { studySets } = await bundle();
  const set = setFor(sessionId, studySets);
  if (!set?.shareCode) return;
  if (!confirm("Stop sharing this set? People who already added it keep their copy; the code stops working.")) return;
  try {
    await send({ type: "SHARE_REVOKE", code: set.shareCode });
    delete set.shareCode;
    await saveStudySet(set);
    setShareOpenFor(null);
    paintDetail();
    toast("Sharing stopped");
  } catch (e) {
    toast(e.message);
  }
}

