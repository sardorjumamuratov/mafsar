const fs = require('fs');
let c = fs.readFileSync('src/ui/views/you.js', 'utf8');

c = c.replace(/<div class="block" style="text-align:center;padding:20px">[\s\S]*?<div class="stat"><div class="v tnum">\$\{studySets\.length\}<\/div><div class="k">Sets<\/div><\/div>\s*<\/div>/, `<div class="block interactive" data-action="open-stats" style="text-align:center;padding:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div style="font-weight:650;font-size:15px">Your Stats</div>
          <div style="font-size:13px;color:var(--primary);font-weight:600">See all stats ></div>
        </div>
        <div style="display:flex;justify-content:center;gap:12px;align-items:center">
          <span class="streak">\${FLAME}\${streak}-day streak</span>
          <span style="font-size:14px;color:var(--ink)">\${mastered} mastered</span>
        </div>
      </div>`);

fs.writeFileSync('src/ui/views/you.js', c);
