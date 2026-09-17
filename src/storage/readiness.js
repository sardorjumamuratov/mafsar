// Pure exam-readiness math. Kept free of chrome.* so it's unit-testable
// with plain node.

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Readiness snapshot for a set with an exam date.
 * @param {{examDate:number, total:number, mastered:number, due:number, now?:number}} arg
 * @returns {{daysLeft:number, progress:number, onTrack:boolean, dailyTarget:number, status:"on-track"|"behind"|"today"|"past"}}
 */
export function examReadiness({ examDate, total, mastered, due, now = Date.now() }) {
  const daysLeft = Math.ceil((examDate - now) / DAY_MS);
  const progress = total ? Math.round((mastered / total) * 100) : 0;
  const remaining = Math.max(0, total - mastered);
  const dailyTarget = daysLeft > 0 ? Math.ceil(remaining / daysLeft) : remaining;
  let status = "on-track";
  if (examDate <= now) status = "past";
  else if (examDate - now < DAY_MS) status = "today";
  // Behind when the required pace exceeds a sustainable ~20 cards/day, or the
  // exam is imminent with most of the set still untouched.
  else if (dailyTarget > 20 || (daysLeft <= 2 && remaining > total * 0.5)) status = "behind";
  return { daysLeft, progress, onTrack: status === "on-track", dailyTarget, status: /** @type {"today" | "on-track" | "past" | "behind"} */ (status) };
}

/**
 * Soonest future exam across study sets.
 * @param {Array<{examDate?:number, sessionId:string, title:string}>} studySets
 * @param {Array<{id:string,title:string}>} sessions
 */
export function nextExam(studySets, sessions, now = Date.now()) {
  let best = null;
  for (const set of studySets) {
    if (!set.examDate || set.examDate <= now) continue;
    if (!best || set.examDate < best.examDate) {
      const session = sessions.find((s) => s.id === set.sessionId);
      best = { examDate: set.examDate, sessionId: set.sessionId, title: session?.title || set.title || "Untitled" };
    }
  }
  return best;
}

/**
 * Rank weak concepts from the review log. Weakness = low grades weighted by
 * recency; ties broken by card easiness (lower = struggled more).
 * @param {Array<{cardId:string, grade:number, at:number}>} reviewLog
 * @param {Array<{id:string, front:string, back:string, easiness?:number, dueDate?:number}>} cards flat list of all cards
 * @param {number} now
 * @returns {Array<{cardId, front, fails:number, avgGrade:number, forgetRisk:boolean}>} worst first
 */
export function weakTopics(reviewLog, cards, now = Date.now()) {
  const byCard = new Map();
  for (const r of reviewLog) {
    const arr = byCard.get(r.cardId) || [];
    arr.push(r);
    byCard.set(r.cardId, arr);
  }
  const out = [];
  for (const [cardId, entries] of byCard) {
    const card = cards.find((c) => c.id === cardId);
    if (!card) continue;
    
    entries.sort((a, b) => (a.reviewedAt || a.at) - (b.reviewedAt || b.at));
    const last5 = entries.slice(-5);
    
    let misses = 0;
    let hards = 0;
    let sum = 0;
    for (const r of last5) {
      if (r.grade < 3) misses++;
      else if (r.grade === 3) hards++;
      sum += r.grade;
    }
    const avgGrade = Number((sum / last5.length).toFixed(2));
    
    const dueSoon = (card.dueDate ?? 0) - now <= 3 * 24 * 60 * 60 * 1000;
    const forgetRisk = avgGrade < 3.5 && (card.easiness ?? 2.5) < 2.5 && dueSoon;
    
    let recovered = false;
    if (last5.length >= 2 && last5[last5.length - 1].grade >= 4 && last5[last5.length - 2].grade >= 4) {
      recovered = true;
    }
    
    if (misses > 0 || hards > 0 || forgetRisk) {
      if (recovered && !forgetRisk) continue;
      out.push({
        cardId,
        sessionId: card.sessionId,
        front: card.front,
        forgetRisk,
        misses,
        hards,
        avgGrade
      });
    }
  }
  
  out.sort((a, b) => {
    if (b.forgetRisk !== a.forgetRisk) return b.forgetRisk ? 1 : -1;
    if (b.misses !== a.misses) return b.misses - a.misses;
    if (b.hards !== a.hards) return b.hards - a.hards;
    if (a.avgGrade !== b.avgGrade) return a.avgGrade - b.avgGrade;
    return a.front.localeCompare(b.front);
  });
  
  return out.slice(0, 5);
}