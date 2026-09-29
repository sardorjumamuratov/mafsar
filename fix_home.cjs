const fs = require('fs');
let c = fs.readFileSync('src/ui/views/home.js', 'utf8');

c = c.replace(/<div class="block" style="display:flex;flex-direction:column;gap:11px">\s*<div class="listhd"><span class="t-label">This week<\/span>\s*<span class="tag">\$\{week\.filter\(\(d\) => d\.count\)\.length\} of 7 days<\/span><\/div>\s*<div class="week">/, `<div class="block interactive" data-action="open-stats" style="display:flex;flex-direction:column;gap:11px;padding-bottom:12px">
        <div class="listhd" style="display:flex;justify-content:space-between;align-items:center;">
          <span class="t-label">This week <span class="tag">\${week.filter((d) => d.count).length} of 7 days</span></span>
          <span style="font-size:13px;color:var(--primary);font-weight:600">See all stats ></span>
        </div>
        <div class="week">`);

fs.writeFileSync('src/ui/views/home.js', c);
