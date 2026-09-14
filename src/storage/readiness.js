// Pure exam-readiness math. Kept free of chrome.* so it's unit-testable
// with plain node.

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Readiness snapshot for a set with an exam date.
 * @param {{examDate:number, total:number, mastered:number, due:number, now?:number}} arg
 * @returns {{daysLeft:number, progress:number, onTrack:boolean, dailyTarget:number, status:"on-track"|"behind"|"today"|"past"}}
 */
import { retrievability } from "./srs.js";

export function examReadiness({ examDate, total, mastered, due, cards = [], now = Date.now() }) {
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
    let predictedRecallAtExam;
  const fsrsCards = cards.filter(c => c.stability !== undefined || c.repetitions > 0);
  if (examDate > now && fsrsCards.length >= Math.max(5, cards.length * 0.2)) {
    let sum = 0;
    for (const c of fsrsCards) {
      sum += (retrievability(c, examDate) || 0);
    }
    predictedRecallAtExam = Number((sum / fsrsCards.length).toFixed(2));
  }
  return { daysLeft, progress, onTrack: status === "on-track", dailyTarget, status: /** @type {"today" | "on-track" | "past" | "behind"} */ (status), predictedRecallAtExam };
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
    const e = byCard.get(r.cardId) || { fails: 0, grades: [] };
    if (r.grade < 3) e.fails++;
    e.grades.push(r.grade);
    byCard.set(r.cardId, e);
  }
  const out = [];
  for (const [cardId, e] of byCard) {
    const card = cards.find((c) => c.id === cardId);
    if (!card) continue;
    const avg = e.grades.reduce((a, b) => a + b, 0) / e.grades.length;
    // Forget-risk: shaky history (low easiness) and due within 3 days.
    const recallNow = retrievability(card, now);
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

    out.push({
      cardId,
      front: card.front,
      fails: e.fails,
      avgGrade: Number(avg.toFixed(2)),
      forgetRisk,
      recall,
      forgetBy,
    });
  }
  // Most fails first, then lowest average grade.
  out.sort((a, b) => b.fails - a.fails || a.avgGrade - b.avgGrade);
  return out.slice(0, 5);
}
