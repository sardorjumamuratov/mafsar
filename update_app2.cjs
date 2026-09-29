const fs = require('fs');
let c = fs.readFileSync('server/src/app.ts', 'utf8');

const oldSetRoute = `    const cards = await all(db, "SELECT front, back FROM cards WHERE set_id = ? AND deleted = 0", [setId]);
    const quiz = await all<{ question: string; options_json: string; answer: number; explain: string | null }>(
      db, "SELECT question, options_json, answer, explain FROM quiz WHERE set_id = ? AND deleted = 0", [setId]
    );
    return c.json({
      title: set.title,
      cards,
      quiz: quiz.map((q) => ({
        q: q.question, options: JSON.parse(q.options_json), answer: q.answer, explain: q.explain ?? "",
      })),
    });`;
    
const newSetRoute = `    const stats = await one<{ rating_count: number; rating_avg: number }>(
      db, "SELECT COUNT(rating) as rating_count, AVG(rating) as rating_avg FROM sets WHERE source = 'global' AND source_label = ?", [setId]
    );
    const cards = await all(db, "SELECT front, back FROM cards WHERE set_id = ? AND deleted = 0", [setId]);
    const quiz = await all<{ question: string; options_json: string; answer: number; explain: string | null }>(
      db, "SELECT question, options_json, answer, explain FROM quiz WHERE set_id = ? AND deleted = 0", [setId]
    );
    return c.json({
      title: set.title,
      rating_count: stats?.rating_count || 0,
      rating_avg: stats?.rating_avg || 0,
      cards,
      quiz: quiz.map((q) => ({
        q: q.question, options: JSON.parse(q.options_json), answer: q.answer, explain: q.explain ?? "",
      })),
    });`;

c = c.replace(oldSetRoute, newSetRoute);
fs.writeFileSync('server/src/app.ts', c);
