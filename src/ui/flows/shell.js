import { openSheet, closeSheet } from "../sheet.js";
import { addCard } from "../../storage/store.js";
import { isDuplicate } from "../../storage/card-dedupe.js";
import { app, esc, setHTML, send, toast } from "../core.js";

// The one layout every study mode shares (docs/design/06-study.html): a top bar
// with close, progress and counter; a scrolling body that starts with the mode
// label and the prompt; and a dock pinned to the bottom for the actions. Modes
// differ only in what they put in `body` and `dock`, which is what keeps the
// top bar, label and prompt at the same place on every screen.
//
// All styling lives in panel.css (.st-*). Nothing here may use inline event
// handlers: the extension CSP blocks them, so interaction goes through the
// document-level data-action router in panel.js and the helpers below.

const ICONS = {
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  circleCheck: '<circle cx="12" cy="12" r="10"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
  circleMinus: '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/>',
  circleX: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>',
  dashed: '<circle cx="12" cy="12" r="10" stroke-dasharray="3 3"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  bulb: '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/>',
};

/** A 24-grid line icon. A stroke other than 2 goes in an inline style, which beats the .st-i rule. */
export function icon(name, size = 18, stroke = 0) {
  return `<svg class="st-i" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"${stroke ? ` style="stroke-width:${stroke}"` : ""}>${ICONS[name]}</svg>`;
}

/** Verdict kinds: ok (accent), part / no (amber, never red), skip (muted). */
const VERDICT_ICON = { ok: "circleCheck", part: "circleMinus", no: "circleX", skip: "dashed" };
export function verdictRow(kind, label) {
  const cls = kind === "ok" ? "ok" : kind === "skip" ? "skip" : "amber";
  return `<div class="st-verdict ${cls}">${icon(VERDICT_ICON[kind] || "circleX", 18)}<span>${esc(label)}</span></div>`;
}

/** A short term reads at 30px, a full question at 22px; either way the prompt's top edge stays put. */
export const promptClassFor = (text) => (String(text || "").length > 70 ? "ask" : "term");

export const primaryBtn =(action, label, attrs = "") => `<button type="button" class="st-btn primary" data-action="${action}"${attrs ? " " + attrs : ""}>${esc(label)}</button>`;
export const secondaryBtn = (action, label, attrs = "") => `<button type="button" class="st-btn secondary" data-action="${action}"${attrs ? " " + attrs : ""}>${esc(label)}</button>`;
export const textBtn = (action, label, attrs = "") => `<button type="button" class="st-link" data-action="${action}"${attrs ? " " + attrs : ""}>${esc(label)}</button>`;
export const waitRow = (msg) => `<div class="st-wait"><span class="spinner"></span><span>${esc(msg)}</span></div>`;

/**
 * Markup for a study screen.
 *  mode        label above the prompt (sentence case; CSS uppercases it)
 *  prompt      plain text, escaped here; promptHtml is trusted markup the caller escaped
 *  promptClass term | ask | q | teach | text (see .st-prompt)
 *  progress    0-100; counter the text on the right ("1 / 37")
 *  hasProgress close asks before leaving
 *  strip       markup between the top bar and the body (Teach it back's ideas)
 *  thread      markup for a chat transcript that replaces the mode label, prompt and body
 *  dock        markup inside the dock; dockClass "col" stacks it
 */
export function shellHtml({ mode = "", prompt = "", promptHtml = "", promptClass = "ask", progress = 0, counter = "", hasProgress = false, strip = "", thread = null, body = "", dock = "", dockClass = "" }) {
  const pct = Math.max(0, Math.min(100, Number(progress) || 0));
  const main = thread !== null
    ? `<div class="st-thread" id="stThread" aria-live="polite">${thread}</div>`
    : `<div class="st-body" id="stBody">
        <div class="st-mode">${esc(mode)}</div>
        ${promptHtml || (prompt ? `<div class="st-prompt ${promptClass}">${esc(prompt)}</div>` : "")}
        ${body}
      </div>`;
  return `<div class="st">
      <div class="st-top">
        <button type="button" class="st-close" data-action="return-focus" aria-label="End session"${hasProgress ? ' data-progress="1"' : ""}>${icon("close", 20)}</button>
        <div class="st-track"><div class="st-fill" style="width:${pct}%"></div></div>
        <div class="st-count">${esc(counter)}</div>
      </div>
      ${strip}
      ${main}
      ${dock ? `<div class="st-dock${dockClass ? " " + dockClass : ""}">${dock}</div>` : ""}
    </div>`;
}

/**
 * Paint a study screen. `keys`, when given, receives keydown events for as long
 * as this screen is up (see the listener below); omit it and the previous
 * screen's shortcuts are dropped.
 */
export function paintShell(opts) {
  keyHandler = opts.keys || null;
  setHTML(app, shellHtml(opts));
}

/** A finished-session screen on the same shell: no emoji, one primary button. */
export function paintDone({ mode, title, detail = "", extra = "", dock = primaryBtn("return-focus", "Done") }) {
  paintShell({
    mode,
    progress: 100,
    counter: "",
    body: `<div class="st-prompt term">${esc(title)}</div>${detail ? `<div class="st-sub">${esc(detail)}</div>` : ""}${extra}`,
    dock,
  });
}

// --- shortcuts ----------------------------------------------------------------
// One listener for the whole panel. It only acts while a study screen is up and
// the screen asked for keys, and every handled key is preventDefault()ed so a
// focused dock button doesn't also fire its own click (that would advance twice).
let keyHandler = null;
document.addEventListener("keydown", (e) => {
  if (!keyHandler || e.defaultPrevented || e.isComposing || e.altKey) return;
  if (!document.querySelector(".st")) return;
  keyHandler(e);
});

/** True while the user is typing in a field, where letters and Space belong to the field. */
export const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(/** @type {HTMLElement} */ (e.target)?.tagName || "") || /** @type {HTMLElement} */ (e.target)?.isContentEditable;
export const metaEnter = (e) => e.key === "Enter" && (e.metaKey || e.ctrlKey);

// --- fields -------------------------------------------------------------------
export function grow(el) {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

/**
 * Wire a text field: auto-grow, keep `btn` disabled while it is empty, and run
 * `onSubmit` for Enter (single-line `enter`) or Cmd/Ctrl+Enter. `onChange` gets
 * the raw value after every edit.
 */
export function bindField(el, { btn = null, onChange = null, onSubmit = null, enter = false } = {}) {
  if (!el) return;
  const sync = () => {
    if (el.tagName === "TEXTAREA") grow(el);
    if (btn) btn.disabled = !el.value.trim();
    if (onChange) onChange(el.value);
  };
  el.addEventListener("input", sync);
  if (onSubmit) {
    el.addEventListener("keydown", (e) => {
      const go = metaEnter(e) || (enter && e.key === "Enter" && !e.shiftKey);
      if (!go || e.isComposing) return;
      e.preventDefault();
      if (!btn || !btn.disabled) onSubmit();
    });
  }
  if (btn) btn.disabled = !el.value.trim();
  if (el.tagName === "TEXTAREA") grow(el);
}

/** Focus a field with the caret after its text, without scrolling the body away from the prompt. */
export function focusEnd(el) {
  if (!el) return;
  el.focus({ preventScroll: true });
  if (el.setSelectionRange && el.value) el.setSelectionRange(el.value.length, el.value.length);
}

/** Keep a growing text block's tallest state on screen: scroll the body so `el` shows. */
export function revealInBody(el) {
  const body = document.getElementById("stBody");
  if (!body || !el) return;
  const b = body.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (r.bottom > b.bottom) body.scrollTop += r.bottom - b.bottom + 16;
  else if (r.top < b.top) body.scrollTop -= b.top - r.top + 16;
}


export function feedbackSummary({ strongest, gap, scoreLine }) {
  let html = `<div style="display:flex;flex-direction:column;gap:12px;padding:16px;border-radius:14px;background:var(--bg-surface);border:1px solid var(--border-control)">`;
  if (scoreLine) html += `<div style="font-size:15px;font-weight:650;color:var(--text-primary);border-bottom:1px solid var(--border-control);padding-bottom:12px;margin-bottom:4px">${esc(scoreLine)}</div>`;
  if (strongest) {
    html += `<div style="display:flex;gap:10px">
      <span style="color:var(--status-mastered);margin-top:2px">${icon("check", 16, 2.5)}</span>
      <span style="display:flex;flex-direction:column;gap:2px">
        <span style="font-size:13px;font-weight:650;text-transform:uppercase;letter-spacing:0.04em;color:var(--status-mastered)">Strongest part</span>
        <span style="font-size:14px;color:var(--text-primary);line-height:1.4">${esc(strongest)}</span>
      </span>
    </div>`;
  }
  if (gap) {
    html += `<div style="display:flex;gap:10px">
      <span style="color:var(--status-learning);margin-top:2px">${icon("arrow-up", 16, 2.5)}</span>
      <span style="display:flex;flex-direction:column;gap:2px">
        <span style="font-size:13px;font-weight:650;text-transform:uppercase;letter-spacing:0.04em;color:var(--status-learning)">Highest leverage gap</span>
        <span style="font-size:14px;color:var(--text-primary);line-height:1.4">${esc(gap)}</span>
      </span>
    </div>`;
  }
  html += `</div>`;
  return html;
}


export async function openSuggestionSheet(sessionId, mode, gaps, topic, existingCards) {
  const existingFronts = existingCards.map(c => c.front).slice(0, 50);
  gaps = gaps.slice(0, 8);
  
  // Show a wait row in the sheet
  openSheet("Turn gaps into cards", `
    <div style="display:flex;align-items:center;justify-content:center;height:100px;color:var(--text-secondary)">
      <span class="st-spin">${icon("loader", 20, 2)}</span>
    </div>
  `, false, null, { px: 16, pb: 24, gap: 14 });

  let res;
  try {
    res = await send({ type: "DRILL_CARD_SUGGESTIONS", mode, gaps, topic, existingFronts });
  } catch (e) {
    if (e.error === "feature_disabled") {
      closeSheet();
      toast("Suggestions are currently disabled.");
      return;
    }
    closeSheet();
    toast(e.message || "Could not generate suggestions.");
    return;
  }
  
  if (!res.suggestions || res.suggestions.length === 0) {
    openSheet("Turn gaps into cards", `
      <div class="st-text15" style="text-align:center;color:var(--text-secondary);padding:24px 0">
        No new concepts needed.
      </div>
      <button type="button" class="sheet-quiet" id="sugg-close">Close</button>
    `, false, null, { px: 16, pb: 24, gap: 14 });
    document.getElementById("sugg-close")?.addEventListener("click", () => closeSheet());
    return;
  }

  let skippedCount = 0;
  const validSuggestions = [];
  for (const sugg of res.suggestions) {
    if (isDuplicate(sugg.front, existingFronts, 0.7)) {
      skippedCount++;
    } else {
      validSuggestions.push(sugg);
    }
  }

  if (validSuggestions.length === 0) {
    openSheet("Turn gaps into cards", `
      <div class="st-text15" style="text-align:center;color:var(--text-secondary);padding:24px 0">
        ${skippedCount} ${skippedCount === 1 ? "is" : "are"} already in your set. No new cards to add.
      </div>
      <button type="button" class="sheet-quiet" id="sugg-close">Close</button>
    `, false, null, { px: 16, pb: 24, gap: 14 });
    document.getElementById("sugg-close")?.addEventListener("click", () => closeSheet());
    return;
  }

  const html = validSuggestions.map((s, i) => `
    <label style="display:flex;gap:12px;padding:12px;background:var(--bg-surface);border:1px solid var(--border-control);border-radius:12px;cursor:pointer">
      <input type="checkbox" checked data-sugg-idx="${i}" style="margin-top:2px">
      <div style="display:flex;flex-direction:column;gap:4px">
        <div style="font-weight:650;font-size:14px;color:var(--text-primary)">${esc(s.front)}</div>
        <div style="font-size:14px;color:var(--text-secondary);line-height:1.4">${esc(s.back)}</div>
        ${s.reason ? `<div style="font-size:13px;color:var(--status-learning);margin-top:4px">${esc(s.reason)}</div>` : ""}
      </div>
    </label>
  `).join("");

  openSheet("Turn gaps into cards", `
    ${skippedCount > 0 ? `<div class="st-note" style="margin-bottom:12px">${skippedCount} ${skippedCount === 1 ? "is" : "are"} already in your set.</div>` : ""}
    <div style="display:flex;flex-direction:column;gap:12px;max-height:400px;overflow-y:auto;margin:0 -16px;padding:0 16px">${html}</div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:16px">
      <button type="button" class="sheet-primary" id="sugg-add">Add selected cards</button>
      <button type="button" class="sheet-quiet" id="sugg-cancel">Not now</button>
    </div>
  `, false, null, { px: 16, pb: 24, gap: 0 });

  document.getElementById("sugg-cancel")?.addEventListener("click", () => closeSheet());
  
  const addBtn = /** @type {HTMLButtonElement} */ (document.getElementById("sugg-add"));
  const checkboxes = /** @type {HTMLInputElement[]} */ (Array.from(document.querySelectorAll('input[data-sugg-idx]')));
  
  checkboxes.forEach(cb => {
    cb.addEventListener("change", () => {
      addBtn.disabled = !checkboxes.some(c => c.checked);
    });
  });

  addBtn?.addEventListener("click", async () => {
    const selected = checkboxes.filter(c => c.checked).map(c => validSuggestions[parseInt(c.getAttribute("data-sugg-idx"), 10)]);
    addBtn.disabled = true;
    addBtn.textContent = "Adding...";
    try {
      for (const s of selected) {
        await addCard(sessionId, s.front, s.back);
      }
      toast(`Added ${selected.length} card${selected.length === 1 ? "" : "s"}.`);
      closeSheet();
    } catch (e) {
      toast("Failed to add cards.");
      addBtn.disabled = false;
      addBtn.textContent = "Add selected cards";
    }
  });
}
