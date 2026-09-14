// --- Activity & streaks -----------------------------------------------------
// activity -> { "YYYY-MM-DD": reviewCount, ... }

export function dayKey(d = new Date()) {
  // Local-date key (not UTC) so a "day" matches the user's calendar.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Consecutive-day streak ending today (or yesterday if nothing yet today). */
export function computeStreak(activity) {
  let streak = 0;
  const d = new Date();
  // If today has no activity yet, an existing streak can still be "alive"
  // from yesterday — start counting there.
  if (!activity[dayKey(d)]) d.setDate(d.getDate() - 1);
  while (activity[dayKey(d)]) {
    streak += 1;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

/** Which of the last 7 calendar days had activity (Mon..Sun-ish, oldest first). */
export function weekActivity(activity) {
  const out = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push({
      key: dayKey(d),
      label: ["S", "M", "T", "W", "T", "F", "S"][d.getDay()],
      count: activity[dayKey(d)] || 0,
      isToday: i === 0,
    });
  }
  return out;
}
