const fs = require("fs");
let s = fs.readFileSync("src/storage/readiness.js", "utf8");

s = s.replace(
  /export function examReadiness\(\{[^}]+\}\) {/,
  `import { retrievability } from "./srs.js";\n\nexport function examReadiness({ examDate, total, mastered, due, cards = [], now = Date.now() }) {`
);

s = s.replace(
  /return \{ daysLeft, progress, onTrack: status === "on-track", dailyTarget, status: \/\*\* @type \{"today" \| "on-track" \| "past" \| "behind"\} \*\/ \(status\) \};/,
  `  let predictedRecallAtExam;
  const fsrsCards = cards.filter(c => c.stability !== undefined || c.repetitions > 0);
  if (examDate > now && fsrsCards.length >= Math.max(5, cards.length * 0.2)) {
    let sum = 0;
    for (const c of fsrsCards) {
      sum += (retrievability(c, examDate) || 0);
    }
    predictedRecallAtExam = Number((sum / fsrsCards.length).toFixed(2));
  }
  return { daysLeft, progress, onTrack: status === "on-track", dailyTarget, status: /** @type {"today" | "on-track" | "past" | "behind"} */ (status), predictedRecallAtExam };`
);

s = s.replace(
  /const dueSoon = \(card\.dueDate \?\? 0\) - now <= 3 \* DAY_MS;\r?\n    out\.push\(\{/,
  `const recallNow = retrievability(card, now);
    let forgetRisk = false;
    let recall = null;
    let forgetBy = null;
    if (recallNow !== null) {
      recall = Number(recallNow.toFixed(2));
      const recall3d = retrievability(card, now + 3 * DAY_MS);
      forgetRisk = recall3d < 0.8;
      
      const DECAY = -0.1542;
      const FACTOR = Math.exp((1 / DECAY) * Math.log(0.9)) - 1;
      const s_val = card.stability || Math.max(1, card.interval || 1);
      const targetT = (s_val / FACTOR) * (Math.pow(0.8, 1 / DECAY) - 1);
      let lastReview = card.lastReview;
      if (lastReview === undefined) {
        if (card.dueDate && card.interval) lastReview = card.dueDate - card.interval * DAY_MS;
        else lastReview = now;
      }
      forgetBy = Math.round(lastReview + targetT * DAY_MS);
    } else {
      const dueSoon = (card.dueDate ?? 0) - now <= 3 * DAY_MS;
      forgetRisk = avg < 3.5 && (card.easiness ?? 2.5) < 2.5 && dueSoon;
    }

    out.push({`
);

s = s.replace(
  /forgetRisk: avg < 3\.5 && \(card\.easiness \?\? 2\.5\) < 2\.5 && dueSoon,/,
  `forgetRisk,\n      recall,\n      forgetBy,`
);

fs.writeFileSync("src/storage/readiness.js", s);
