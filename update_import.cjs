const fs = require('fs');
let c = fs.readFileSync('src/ui/views/import.js', 'utf8');

const oldPaint = `export function paintSharePreview(out) {
  const target = out || document.getElementById("sharePreview");
  if (!target || !sharedPreview) return;
  const { title, cards, quiz } = sharedPreview;
  setHTML(target, \`
    <div class="block" style="display:flex;flex-direction:column;gap:9px">
      <div class="t-label">Found</div>
      <div style="font-weight:650;color:var(--ink);line-height:1.3">\${esc(title)}</div>
      <div style="font-size:12.5px;color:var(--muted)">Copy with \${cards.length} card\${cards.length === 1 ? "" : "s"}\${quiz?.length ? \` and \${quiz.length} quiz question\${quiz.length === 1 ? "" : "s"}\` : ""} — added fresh, reviews start from scratch.</div>
      <button class="btn btn-primary btn-block" data-action="share-import">Add to my sets</button>
    </div>\`);
}`;

const newPaint = `export function paintSharePreview(out) {
  const target = out || document.getElementById("sharePreview");
  if (!target || !sharedPreview) return;
  const { title, cards, quiz, isGlobal, rating_avg, rating_count } = sharedPreview;
  let starsHtml = "";
  if (isGlobal && rating_count !== undefined) {
    starsHtml = \`<div style="margin-top:2px"><span class="tag" style="color:var(--warm)">? \${(rating_avg || 0).toFixed(1)} • \${rating_count || 0}</span></div>\`;
  }
  setHTML(target, \`
    <div class="block" style="display:flex;flex-direction:column;gap:9px">
      <div class="t-label">Found</div>
      <div style="font-weight:650;color:var(--ink);line-height:1.3">\${esc(title)}</div>
      \${starsHtml}
      <div style="font-size:12.5px;color:var(--muted)">Copy with \${cards.length} card\${cards.length === 1 ? "" : "s"}\${quiz?.length ? \` and \${quiz.length} quiz question\${quiz.length === 1 ? "" : "s"}\` : ""} — added fresh, reviews start from scratch.</div>
      <button class="btn btn-primary btn-block" data-action="share-import">Add to my sets</button>
    </div>\`);
}`;

c = c.replace(oldPaint, newPaint);
fs.writeFileSync('src/ui/views/import.js', c);
