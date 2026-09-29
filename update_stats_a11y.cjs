const fs = require('fs');
let c = fs.readFileSync('src/ui/views/stats.js', 'utf8');

c = c.replace(/let heatmapHtml = '<div class="heatmap"/, `let heatmapHtml = '<div class="sr-only">Calendar heatmap of your activity over the last 16 weeks.</div><div class="heatmap" aria-hidden="true"`);
c = c.replace(/const barHtml = \`/, "const barHtml = `<div class=\"sr-only\">Bar chart showing daily review counts for the last 30 days.</div>` +\n    `");
c = c.replace(/const upHtml = \`/, "const upHtml = `<div class=\"sr-only\">Bar chart showing cards due over the next 7 days.</div>` +\n    `");

fs.writeFileSync('src/ui/views/stats.js', c);
