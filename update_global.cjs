const fs = require('fs');
let c = fs.readFileSync('src/ui/views/global.js', 'utf8');

const oldGlobal = `    const html = sets.map(s => \`
      <div class="block interactive" data-action="global-preview" data-id="\${esc(s.id)}">
        <div style="font-weight:650;color:var(--ink);line-height:1.3">\${esc(s.title)}</div>
        \${s.topic ? \`<div style="font-size:12.5px;color:var(--muted);margin-top:2px">\${esc(s.topic)}</div>\` : ""}
        <div style="font-size:12px;color:var(--muted);margin-top:8px;display:flex;justify-content:space-between">
          <span>\${s.card_count} card\${s.card_count === 1 ? '' : 's'}</span>
          <span>\${s.adds} \${s.adds === 1 ? "add" : "adds"}</span>
        </div>
      </div>
    \`).join("");`;

const newGlobal = `    const html = sets.map(s => {
      const r = (s.rating_avg || 0).toFixed(1);
      const rc = s.rating_count || 0;
      const globalStars = \`<span class="tag" style="color:var(--warm)">? \${r} • \${rc}</span>\`;
      const myStars = s.added && s.my_rating ? \`<span class="tag" style="color:var(--warm)">? \${s.my_rating} (you)</span>\` : (s.added ? \`<span class="tag">Added</span>\` : \`\`);
      return \`
        <div class="block interactive" data-action="global-preview" data-id="\${esc(s.id)}">
          <div style="font-weight:650;color:var(--ink);line-height:1.3">\${esc(s.title)}</div>
          \${s.topic ? \`<div style="font-size:12.5px;color:var(--muted);margin-top:2px">\${esc(s.topic)}</div>\` : ""}
          <div style="font-size:12px;color:var(--muted);margin-top:8px;display:flex;justify-content:space-between;align-items:center;">
            <div style="display:flex;gap:6px">\${globalStars}\${myStars}</div>
            <span>\${s.card_count} card\${s.card_count === 1 ? '' : 's'}</span>
          </div>
        </div>
      \`;
    }).join("");`;

c = c.replace(oldGlobal, newGlobal);
fs.writeFileSync('src/ui/views/global.js', c);
