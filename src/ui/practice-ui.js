import { esc } from "./core.js";
import { openSheet, closeSheet } from "./sheet.js";
import { getSettings, saveSettings } from "../storage/store.js";
import { PRACTICE_STYLES, STYLE_IDS, isStyle, resolveStyle } from "../storage/practice-style.js";
import { LEVELS, LEVEL_IDS, isLevel, levelLabel, resolveLevel } from "../storage/practice-level.js";
import { icon } from "./flows/shell.js";

// Choosing a practice style for the system design modes (docs/prompts/38 §4):
// the first-run sheet, the per-session override on the set page, and the
// default under You → Practice style. One option list serves all three.

// Per-set override for the next sessions, kept in memory: "this session only"
// unless "Make this my default" is ticked.
const overrides = new Map();

export function sessionOverride(sessionId) {
  return overrides.get(sessionId) || null;
}

export async function defaultStyle() {
  return resolveStyle(await getSettings(), null);
}

/** The style a drill on this set starts with: the override, else the default, else null (ask first). */
export async function styleFor(sessionId) {
  return resolveStyle(await getSettings(), overrides.get(sessionId));
}

function optionList(current) {
  return `<div class="style-opts" role="group" aria-label="Practice style">${STYLE_IDS.map((id) => {
    const s = PRACTICE_STYLES[id];
    return `<button type="button" class="style-opt${current === id ? " on" : ""}" data-style="${id}" aria-pressed="${current === id}">
        <span class="style-ic">${icon(s.icon, 20)}</span>
        <span class="style-text"><span class="t">${esc(s.label)}</span><span class="d">${esc(s.description)}</span></span>
      </button>`;
  }).join("")}</div>`;
}

function onPick(handler) {
  document.querySelectorAll("#sheet .style-opt").forEach((b) => {
    b.addEventListener("click", () => {
      const style = /** @type {HTMLElement} */ (b).dataset.style;
      if (isStyle(style)) handler(style);
    });
  });
}

/** Asked once, before the first system design drill. Saves the default, then starts. */
export function openFirstRunSheet(start) {
  openSheet("What are you practicing for?", `
    ${optionList(null)}
    <div class="st-note" style="margin-top:0">You can change this anytime in Practice settings.</div>`, false, null, { px: 22, pb: 24, gap: 16 });
  onPick(async (style) => {
    await saveSettings({ systemDesignPracticeStyle: style });
    closeSheet();
    start(style);
  });
}

/** From the set page: change the style for this set's next sessions, optionally as the default. */
export async function openStyleOverrideSheet(sessionId, onChange) {
  const current = await styleFor(sessionId);
  openSheet("Practice style", `
    ${optionList(current)}
    <label class="style-default"><input type="checkbox" id="styleMakeDefault"> Make this my default</label>`, false, null, { px: 22, pb: 24, gap: 16 });
  onPick(async (style) => {
    const makeDefault = /** @type {HTMLInputElement|null} */ (document.getElementById("styleMakeDefault"))?.checked;
    if (makeDefault) {
      await saveSettings({ systemDesignPracticeStyle: style });
      overrides.delete(sessionId);
    } else {
      overrides.set(sessionId, style);
    }
    closeSheet();
    onChange?.(style);
  });
}

/** You → Practice settings: the saved default. */
export async function openPracticeSettingsSheet(onChange) {
  const current = await defaultStyle();
  openSheet("Practice style", `
    ${optionList(current)}
    <div class="st-note" style="margin-top:0">Used for Design brief, Estimation and What breaks. You can switch for one set from its page.</div>`, false, null, { px: 22, pb: 24, gap: 16 });
  onPick(async (style) => {
    await saveSettings({ systemDesignPracticeStyle: style });
    closeSheet();
    onChange?.(style);
  });
}

/** Start a system design drill with its style, asking first when none is chosen yet. */
export async function startWithStyle(sessionId, start) {
  const style = await styleFor(sessionId);
  if (style) return start(sessionId, style);
  openFirstRunSheet((chosen) => start(sessionId, chosen));
}

// --- Levels for the Medicine modes (docs/prompts/39): chosen per set, kept on this device ---

export async function levelFor(sessionId) {
  return resolveLevel(await getSettings(), sessionId);
}

export async function setLevel(sessionId, level) {
  if (!isLevel(level)) return;
  const settings = await getSettings();
  await saveSettings({ practiceLevels: { ...(settings.practiceLevels || {}), [sessionId]: level } });
}

/** From the set page: pick how hard the cases and chains are for this set. */
export async function openLevelSheet(sessionId, onChange) {
  const current = await levelFor(sessionId);
  openSheet("Level", `<div class="style-opts" role="group" aria-label="Level">${LEVEL_IDS.map((id) => `
      <button type="button" class="style-opt${current === id ? " on" : ""}" data-level="${id}" aria-pressed="${current === id}">
        <span class="style-text"><span class="t">${esc(LEVELS[id].label)}</span><span class="d">${esc(LEVELS[id].description)}</span></span>
      </button>`).join("")}</div>
    <div class="st-note" style="margin-top:0">Beginner is the default. You can change it any time.</div>`, false, null, { px: 22, pb: 24, gap: 16 });
  document.querySelectorAll("#sheet .style-opt").forEach((b) => {
    b.addEventListener("click", async () => {
      await setLevel(sessionId, /** @type {HTMLElement} */ (b).dataset.level);
      closeSheet();
      onChange?.(/** @type {HTMLElement} */ (b).dataset.level);
    });
  });
}

export { levelLabel };
