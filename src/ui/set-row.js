import { esc } from "./core.js";
import { cleanTitle } from "../../shared/titles.js";
import { formatAvg, formatCount } from "../../shared/format.js";
import { ICONS } from "./icons.js";

export function SetRowHtml(set, ratings) {
  // If ratings isn't passed, gracefully handle (e.g. from tests)
  const r = ratings ? ratings[set.originSetId || set.id] : null;
  
  let ratingText = "";
  if (r && r.ratingAvg !== null) {
    const avg = formatAvg(r.ratingAvg);
    const suffix = r.isGlobal ? ` (${formatCount(r.ratingCount)})` : " yours";
    ratingText = ` &bull; <span style="display:inline-flex;align-items:center;gap:3px;color:var(--text-secondary);font-weight:600">${ICONS.star.replace('stroke="currentColor"', 'fill="var(--text-secondary)" stroke="var(--text-secondary)" width="12" height="12"')}${avg}</span><span style="color:var(--text-muted)">${suffix}</span>`;
  }
  
  let globalText = "";
  if (r && r.isGlobal) {
    globalText = ` &bull; <span style="display:inline-flex;align-items:center;gap:3px">${ICONS.globe.replace('<svg', '<svg width="12" height="12"')} Global</span>`;
  }

  const metaLine = `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px">${esc(set.source || "Unknown")}${ratingText}${globalText}</div>`;
  
  const mastery = set.mastery || 0;
  let dueText = "";
  if (set.due > 0) {
    dueText = `<div class="due-count">${set.due}</div><div class="due-label">due</div>`;
  } else if (mastery === 1) {
    dueText = `<svg viewBox="0 0 24 24" class="due-check"><path d="M20 6L9 17l-5-5"/></svg>`;
  }
  
  const progHtml = mastery > 0 ? `<div class="prog-bar"><div class="prog-fill" style="width:${Math.max(2, mastery * 100)}%"></div></div>` : "";
  
  return `<button type="button" class="set-row" data-action="open-set" data-id="${esc(set.id)}">
    <div class="sr-tile">
      ${esc(set.source ? set.source.substring(0, 2) : "S")}
    </div>
    <div class="sr-mid">
      <div class="sr-title">${esc(cleanTitle(set.title))}</div>
      <div class="sr-meta">${metaLine}</div>
      ${progHtml}
    </div>
    <div class="sr-right">
      ${dueText}
    </div>
  </button>`;
}
