const fs = require("fs");
let s = fs.readFileSync("server/src/app.ts", "utf8");

s = s.replace(
  /app\.get\("\/v1\/insights"[\s\S]*?501\)\);/,
  `app.get("/v1/insights", async (c) => {
    const user = c.get("user");
    const db = c.get("db");
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    
    // retention
    const thirtyDaysAgo = new Date(now - 30 * DAY).toISOString();
    
    const sets = await all<any>(db, "SELECT id, title, exam_date FROM sets WHERE user_id = ? AND (deleted = 0 OR deleted IS NULL)", [user.id]);
    const setIds = new Set(sets.map(s => s.id));
    
    const cards = await all<any>(db, "SELECT id, set_id, front, due_date, stability, state, interval, last_review, repetitions, lapses FROM cards WHERE user_id = ? AND (deleted = 0 OR deleted IS NULL)", [user.id]);
    
    const revs = await all<any>(db, "SELECT grade, prev_interval FROM review_log WHERE user_id = ? AND kind = ? AND reviewed_at >= ? AND prev_interval >= 1 LIMIT 5000", [user.id, "flashcard", thirtyDaysAgo]);
    let observed30d = null;
    let reviews30d = revs.length;
    if (reviews30d >= 20) {
      const good = revs.filter(r => r.grade >= 3).length;
      observed30d = Number((good / reviews30d).toFixed(2));
    }
    
    let weak = [];
    let forecastMap: Record<string, number> = {};
    for (let i = 0; i < 14; i++) {
      const d = new Date(now + i * DAY);
      forecastMap[d.toISOString().split("T")[0]] = 0;
    }
    
    const setStats = new Map();
    for (const s of sets) {
      if (s.exam_date && Date.parse(s.exam_date) > now) {
        setStats.set(s.id, { id: s.id, title: s.title, examDate: s.exam_date, cards: 0, reviewed: 0, sumR: 0 });
      }
    }

    for (const c of cards) {
      if (!setIds.has(c.set_id)) continue;
      
      const st = setStats.get(c.set_id);
      if (st) {
        st.cards++;
        if (c.stability !== null || c.repetitions > 0) {
          st.reviewed++;
          st.sumR += (retrievability({ ...c, dueDate: c.due_date, lastReview: c.last_review }, Date.parse(st.examDate)) || 0);
        }
      }

      if (c.due_date) {
        const dd = typeof c.due_date === "string" ? Date.parse(c.due_date) : c.due_date;
        if (dd <= now + 14 * DAY) {
          let bucketDate = dd < now ? new Date(now) : new Date(dd);
          const dateStr = bucketDate.toISOString().split("T")[0];
          if (forecastMap[dateStr] !== undefined) {
             forecastMap[dateStr]++;
          }
        }
      }
      
      const r3 = retrievability({ ...c, dueDate: c.due_date, lastReview: c.last_review }, now + 3 * DAY);
      if (r3 !== null && r3 < 0.8) {
        weak.push({
          cardId: c.id,
          setId: c.set_id,
          front: c.front,
          lapses: c.lapses || 0,
          recall: Number((retrievability({ ...c, dueDate: c.due_date, lastReview: c.last_review }, now) || 0).toFixed(2)),
          forgetBy: new Date(forgetBy({ ...c, dueDate: c.due_date, lastReview: c.last_review }, now) || now).toISOString(),
          _r3: r3
        });
      }
    }
    
    weak.sort((a, b) => a._r3 - b._r3);
    weak = weak.slice(0, 10).map(({ _r3, ...rest }) => rest);

    const forecast = Object.entries(forecastMap).map(([day, due]) => ({ day, due })).sort((a, b) => a.day.localeCompare(b.day));
    
    const exams = [];
    for (const st of setStats.values()) {
      exams.push({
        setId: st.id,
        title: st.title,
        examDate: st.examDate,
        daysLeft: Math.ceil((Date.parse(st.examDate) - now) / DAY),
        predictedRecall: st.reviewed > 0 && st.reviewed >= Math.max(5, st.cards * 0.2) ? Number((st.sumR / st.reviewed).toFixed(2)) : null,
        cards: st.cards,
        reviewed: st.reviewed
      });
    }

    return c.json({
      generatedAt: new Date(now).toISOString(),
      retention: { target: 0.9, observed30d, reviews30d },
      weakTopics: weak,
      forecast,
      exams
    });
  });`
);

fs.writeFileSync("server/src/app.ts", s);
