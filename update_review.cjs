const fs = require('fs');
let c = fs.readFileSync('src/ui/flows/review.js', 'utf8');

const oldPaint = `  const paint = (cta) =>
    setHTML(app, \`
      <div class="view">
        <div class="done-msg"><div class="big">??</div>
          <div style="font-weight:650;color:var(--ink)">Review complete</div>
          <div style="margin-top:4px">\${reviewed} card\${reviewed === 1 ? "" : "s"} reviewed.</div>
        </div>
        \${cta}
        <button class="btn btn-\${cta ? "ghost" : "primary"} btn-block" data-action="return-focus">Done</button>
      </div>\`);`;

const newPaint = `  const paint = (cta, ratingHtml = "") =>
    setHTML(app, \`
      <div class="view">
        <div class="done-msg"><div class="big">??</div>
          <div style="font-weight:650;color:var(--ink)">Review complete</div>
          <div style="margin-top:4px">\${reviewed} card\${reviewed === 1 ? "" : "s"} reviewed.</div>
        </div>
        \${ratingHtml}
        \${cta}
        <button class="btn btn-\${cta || ratingHtml ? "ghost" : "primary"} btn-block" data-action="return-focus">Done</button>
      </div>\`);`;

c = c.replace(oldPaint, newPaint);

const oldPaintCall = `  paint("");

  // Recognition (flashcards) then recall under pressure (quiz) is the natural
  // next step — offer it, but only when the whole queue came from one set.
  const ids = [...new Set(queue.map((i) => i.sessionId))];
  if (ids.length !== 1) return;
  const { studySets } = await bundle();
  const set = setFor(ids[0], studySets);`;

const newPaintCall = `  const ids = [...new Set(queue.map((i) => i.sessionId))];
  let ratingHtml = "";
  const { sessions, studySets } = await bundle();
  if (ids.length === 1) {
    const se = sessions.find(s => s.id === ids[0]);
    const st = setFor(ids[0], studySets);
    if (se?.source === 'global' && !st?.rating && !localStorage.getItem("rated_" + ids[0])) {
      localStorage.setItem("rated_" + ids[0], "1");
      ratingHtml = \`
        <div class="block tint" style="text-align:center; padding:16px">
          <div style="font-weight:650; margin-bottom:8px">Rate this Global set</div>
          <div class="rating-ctrl" role="slider" aria-valuemin="0" aria-valuemax="5" aria-valuenow="0" tabindex="0" data-action="rate-set" data-id="\${esc(ids[0])}" style="display:inline-flex;gap:4px;color:var(--warm);cursor:pointer;">
            \${[1,2,3,4,5].map(i => \`<span data-val="\${i}" class="star" style="font-size:32px; line-height:1; width:44px;">?</span>\`).join('')}
          </div>
        </div>
      \`;
    }
  }

  paint("", ratingHtml);

  // Recognition (flashcards) then recall under pressure (quiz) is the natural
  // next step — offer it, but only when the whole queue came from one set.
  if (ids.length !== 1) return;
  const set = setFor(ids[0], studySets);`;

c = c.replace(oldPaintCall, newPaintCall);

// Need to update subsequent paint(cta) calls
c = c.replace(/paint\(cta\);/, `paint(cta, ratingHtml);`);

fs.writeFileSync('src/ui/flows/review.js', c);
