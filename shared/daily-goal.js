// Home's daily goal and "Fading soon" (redesign 01). Pure, so it's testable
// and the phone app can use it too.
import { isDue, masteryOf, retrievability } from "./srs.js";

const DAY_MS = 86_400_000;
// The scheduler's desired retention: a card "fades" when its predicted recall
// drops below this.
export const DESIRED_RETENTION = 0.9;

function startOfDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * @param {{ sessionId: string, examDate?: number|null, flashcards?: any[] }[]} studySets
 * @param {number} [now]
 */
export function computeDailyGoal(studySets, now = Date.now()) {
  let totalDue = 0;
  let learningDueToday = 0;
  let nearestExam = null;
  const setsWithDue = new Set();
  const midnight = startOfDay(now) + DAY_MS;

  for (const st of studySets) {
    if (st.examDate && st.examDate > now && (nearestExam == null || st.examDate < nearestExam)) nearestExam = st.examDate;
    for (const c of st.flashcards || []) {
      if (c.deleted) continue;
      if (isDue(c, now)) {
        totalDue++;
        setsWithDue.add(st.sessionId);
      }
      if (masteryOf(c) === "learning" && c.dueDate != null && Number(new Date(c.dueDate)) < midnight) learningDueToday++;
    }
  }

  // Whole local days to the nearest upcoming exam; a past exam counts as none.
  const daysUntilExam = nearestExam == null ? null : Math.max(0, Math.round((startOfDay(nearestExam) - startOfDay(now)) / DAY_MS));
  const goalCount = nearestExam == null
    ? Math.min(totalDue, 40)
    : Math.min(totalDue, Math.ceil(totalDue / Math.max(1, daysUntilExam)) + learningDueToday);
  const goalMinutes = goalCount > 0 ? Math.max(1, Math.round((goalCount * 22) / 60)) : 0;

  return { totalDue, setCount: setsWithDue.size, goalCount, goalMinutes, learningDueToday, nearestExam, daysUntilExam };
}

/**
 * Cards that aren't due yet but whose predicted recall drops below the
 * desired retention within the next 24h, lowest current recall first.
 */
export function fadingSoon(studySets, now = Date.now()) {
  const out = [];
  for (const st of studySets) {
    for (const c of st.flashcards || []) {
      if (c.deleted || isDue(c, now)) continue;
      const later = retrievability(c, now + DAY_MS);
      if (later == null || later >= DESIRED_RETENTION) continue;
      out.push({ sessionId: st.sessionId, card: c, recall: retrievability(c, now) ?? 1 });
    }
  }
  return out.sort((a, b) => a.recall - b.recall);
}
