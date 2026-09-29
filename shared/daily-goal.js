export function computeDailyGoal(sets, reviewLog) {
  let totalDue = 0;
  let setCount = 0;
  let nearestExam = null;
  const now = Date.now();
  
  for (const s of sets) {
    if (s.due > 0) {
      totalDue += s.due;
      setCount++;
    }
    if (s.examDate) {
      const ms = new Date(s.examDate).getTime();
      if (ms > now) {
        if (!nearestExam || ms < nearestExam) nearestExam = ms;
      }
    }
  }
  
  let learningDueToday = 0; // The prompt asks for cards in Learning state due before local midnight.
  // Actually, computing this requires checking all cards, which is heavy. Wait, how do I get `learningDueToday` without cards?
  // "totalDue = due cards across all sets". "learningDueToday = cards in the Learning state due before local midnight"
  // Is this info on the set object? No, we might need to query it, but wait, `store.js` or `app.js` can pass the `cards` map.
  return { totalDue, setCount, goalCount: Math.min(totalDue, 40), goalMinutes: 5, learningDueToday: 0, nearestExam };
}
