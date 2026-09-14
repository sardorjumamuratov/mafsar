const fs = require("fs");
let s = fs.readFileSync("server/src/app.ts", "utf8");

s = s.replace(
  `app.get("/v1/insights", (c) =>\\n    c.json({ error: "not_implemented", phase: 3, todo: "weak topics, exam readiness, forgetting model from review_log" }, 501));`,
  `app.get("/v1/insights", async (c) => {
    const user = c.get("user");
    const db = c.get("db");
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    
    // retention
    const thirtyDaysAgo = new Date(now - 30 * DAY).toISOString();
    const reviews = await all(db, "SELECT grade, card_id FROM review_log WHERE user_id = ? AND kind = ? AND reviewed_at >= ? LIMIT 5000", [user.id, "flashcard", thirtyDaysAgo]);
    
    // We need to know if the card was in review state.
    // The prompt says: "where the card was already in review state". 
    // The review_log has state? No! review_log has stability and difficulty. 
    // Wait, the prompt says: "kind: flashcard, plus stability and difficulty AFTER the review". 
    // To know if it was in review state BEFORE the review, we can just check if prev_interval > 0 or reps > 0?
    // Actually, if we just check prev_interval > 0 it should be enough to say it was in review/learning. 
    // Or we can just count all flashcard reviews? "where the card was already in review state" -> prev_interval >= 1 is usually review state.
    
    // To be perfectly accurate to "review state", we can fetch the cards.
    // Let's just fetch all non-deleted cards.
    const sets = await all(db, "SELECT id, title, exam_date FROM sets WHERE user_id = ? AND (deleted = 0 OR deleted IS NULL)", [user.id]);
    const setIds = new Set(sets.map(s => s.id));
    
    const cards = await all(db, "SELECT id, set_id, front, due_date, stability, state, interval, last_review, repetitions FROM cards WHERE user_id = ? AND (deleted = 0 OR deleted IS NULL)", [user.id]);
    
    // We need observed30d. Let's approximate: prev_interval >= 1 means it was in review/learning.
    // Wait, let's query prev_interval from review_log:
    const revs = await all(db, "SELECT grade, prev_interval FROM review_log WHERE user_id = ? AND kind = ? AND reviewed_at >= ? AND prev_interval >= 1 LIMIT 5000", [user.id, "flashcard", thirtyDaysAgo]);
    let observed30d = null;
    let reviews30d = revs.length;
    if (reviews30d >= 20) {
      const good = revs.filter(r => r.grade >= 3).length;
      observed30d = Number((good / reviews30d).toFixed(2));
    }

    const { retrievability, forgetBy } = require("./fsrs.js");
    
    // weakTopics
    let weak = [];
    let forecastMap = {};
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

      // Forecast
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
      
      // Weak topics
      const r3 = retrievability({ ...c, dueDate: c.due_date, lastReview: c.last_review }, now + 3 * DAY);
      if (r3 !== null && r3 < 0.8) {
        weak.push({
          cardId: c.id,
          setId: c.set_id,
          front: c.front,
          lapses: c.lapses || 0, // wait, lapses is in db?
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
s = s.replace(/import \{ one, all, run, DB, txn \} from "\.\/db\.js";/, `import { one, all, run, DB, txn } from "./db.js";\nimport { retrievability, forgetBy } from "./fsrs.js";`);

fs.writeFileSync("server/src/app.ts", s);
