import { esc } from "./core.js";

function cleanTitle(t) { return t; } // TODO: import cleanTitle from somewhere if exists

export function SetRowHtml(set, meta) {
  // 10. SetRow
  const ratingText = set.rating ? ` · ? ${set.rating}` : "";
  const globalText = set.isGlobal ? ` · ?? Global` : "";
  const metaLine = `${esc(set.source || "Unknown")}${ratingText}${globalText}`;
  
  const mastery = set.mastery || 0;
  let dueText = "";
  if (set.due > 0) {
    dueText = `<div class="due-count">${set.due}</div><div class="due-label">due</div>`;
  } else if (mastery === 1) {
    dueText = `<svg viewBox="0 0 24 24" class="due-check"><path d="M20 6L9 17l-5-5"/></svg>`;
  }
  
  const progHtml = mastery > 0 ? `<div class="prog-bar"><div class="prog-fill" style="width:${mastery * 100}%"></div></div>` : "";
  
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
