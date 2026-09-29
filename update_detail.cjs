const fs = require('fs');
let c = fs.readFileSync('src/ui/views/set-detail.js', 'utf8');

const oldHeader = `        <div><div class="h-title" style="line-height:1.25">\${esc(session.title || "Untitled")}</div>
          <div style="display:flex;gap:6px;margin-top:8px"><span class="tag dot" style="color:var(--primary)">\${esc(sourceLabel(session))}</span></div>
        </div>`;

const newHeader = `        <div><div class="h-title" style="line-height:1.25">\${esc(session.title || "Untitled")}</div>
          <div style="display:flex;gap:12px;margin-top:8px;align-items:center;">
            <span class="tag dot" style="color:var(--primary)">\${esc(sourceLabel(session))}</span>
            <div class="rating-ctrl" role="slider" aria-valuemin="0" aria-valuemax="5" aria-valuenow="\${s.rating || 0}" aria-label="\${s.rating || 0} of 5 stars" tabindex="0" data-id="\${esc(session.id)}" style="display:flex;gap:2px;color:var(--warm);cursor:pointer;">
              \${[1,2,3,4,5].map(i => \`<span data-val="\${i}" class="star" style="font-size:28px; line-height:1; width:44px; text-align:center;">\${(s.rating||0) >= i ? '?' : '?'}</span>\`).join('')}
            </div>
          </div>
        </div>`;

c = c.replace(oldHeader, newHeader);
fs.writeFileSync('src/ui/views/set-detail.js', c);
