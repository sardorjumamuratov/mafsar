const fs = require('fs');
let c = fs.readFileSync('src/ui/views/sets.js', 'utf8');

const oldSetRow = `export function setRow(session, s) {
  const dueTag = s.due
    ? \`<span class="tag dot" style="color:var(--warm)">\${s.due} due</span>\`
    : s.progress === 100 && s.total
    ? \`<span class="tag">Mastered</span>\`
    : \`<span class="tag">0 due</span>\`;
  return \`
    <div class="setrow" data-action="open-set" data-id="\${esc(session.id)}">
      <div class="top"><div class="name">\${esc(session.title || "Untitled")}</div>\${dueTag}</div>
      <div class="bar \${s.progress === 100 && s.total ? "ok" : ""}"><i style="width:\${s.total ? s.progress : 0}%"></i></div>
      <div class="prog-line"><span>\${s.total ? s.progress + "% mastered" : "Not generated"}</span><span>\${esc(sourceLabel(session))}</span></div>
    </div>\`;
}`;

const newSetRow = `export function setRow(session, s) {
  const dueTag = s.due
    ? \`<span class="tag dot" style="color:var(--warm)">\${s.due} due</span>\`
    : s.progress === 100 && s.total
    ? \`<span class="tag">Mastered</span>\`
    : \`<span class="tag">0 due</span>\`;
  
  let starsHtml = '';
  if (s.published) {
    starsHtml = \`<span class="tag" style="color:var(--warm)">? \${(s.globalRatingAvg || 0).toFixed(1)} • \${s.globalRatingCount || 0}</span>\`;
  } else {
    const r = s.rating || 0;
    const filled = "?????".slice(0, r);
    const empty = "?????".slice(r);
    starsHtml = \`<span style="color:var(--warm); font-size:1.1em; letter-spacing:-1px">\${filled}\${empty}</span>\`;
  }

  return \`
    <div class="setrow" data-action="open-set" data-id="\${esc(session.id)}">
      <div class="top"><div class="name">\${esc(session.title || "Untitled")}</div>\${dueTag}</div>
      <div class="bar \${s.progress === 100 && s.total ? "ok" : ""}"><i style="width:\${s.total ? s.progress : 0}%"></i></div>
      <div class="prog-line"><span>\${s.total ? s.progress + "% mastered" : "Not generated"} \${starsHtml}</span><span>\${esc(sourceLabel(session))}</span></div>
    </div>\`;
}`;

c = c.replace(oldSetRow, newSetRow);
fs.writeFileSync('src/ui/views/sets.js', c);
