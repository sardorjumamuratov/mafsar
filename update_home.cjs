const fs = require('fs');
let c = fs.readFileSync('src/ui/views/home.js', 'utf8');

const oldWeek = `<div class="block" style="display:flex;flex-direction:column;gap:11px">
        <div class="listhd"><span class="t-label">This week</span>
          <span class="tag">\${week.filter((d) => d.count).length} of 7 days</span></div>
        <div class="week">
          \${week
            .map(
              (d) =>
                \`<div class="d"><span class="dot \${d.isToday ? "today" : d.count ? "on" : ""}"></span><span class="lbl">\${d.label}</span></div>\`
            )
            .join("")}
        </div>`;

const newWeek = `<div class="block interactive" data-action="open-stats" style="display:flex;flex-direction:column;gap:11px;padding-bottom:12px">
        <div class="listhd" style="display:flex;justify-content:space-between;align-items:center;">
          <span class="t-label">This week <span class="tag">\${week.filter((d) => d.count).length} of 7 days</span></span>
          <span style="font-size:13px;color:var(--primary);font-weight:600">See all stats ></span>
        </div>
        <div class="week">
          \${week
            .map(
              (d) =>
                \`<div class="d"><span class="dot \${d.isToday ? "today" : d.count ? "on" : ""}"></span><span class="lbl">\${d.label}</span></div>\`
            )
            .join("")}
        </div>`;

c = c.replace(oldWeek, newWeek);
fs.writeFileSync('src/ui/views/home.js', c);
