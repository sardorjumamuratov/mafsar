const fs = require('fs');
let c = fs.readFileSync('src/ui/views/stats.js', 'utf8');

const emptyState = `
  if (!reviewLog.length && !Object.keys(activity).length) {
    const emptyBody = \`
      <div class="view">
        <div class="ahd">
          <button class="iconbtn" data-action="nav-back" aria-label="Back">\${XBTN}</button>
          <div class="h-title" style="font-size:16px">Your Stats</div>
        </div>
        <div class="block tint" style="text-align:center;margin:16px">
          <div style="font-size:26px">??</div>
          <div style="font-weight:650;margin-top:6px">Stats appear here</div>
          <div style="font-size:12.5px;color:var(--muted);margin-top:4px">
            Start reviewing flashcards to see your streak, retention, performance graphs, and personalized study insights.
          </div>
          <button class="btn btn-primary" style="margin-top:12px" data-action="nav-home">Go to Home</button>
        </div>
      </div>
    \`;
    setHTML(app, emptyBody);
    return;
  }
`;

c = c.replace(/const nowMs = Date\.now\(\);/, emptyState + '\n  const nowMs = Date.now();');
fs.writeFileSync('src/ui/views/stats.js', c);
